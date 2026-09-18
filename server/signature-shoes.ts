import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import {
  SHOE_TERMS_BY_TIER,
  SIGNATURE_SHOE_IMAGE_MAX_BYTES,
  SIGNATURE_SHOE_IMAGE_TYPES,
  SIGNATURE_SHOE_NAME_MAX_LENGTH,
  allocateShoeUnits,
  calculateFollowerUnits,
  calculateLaunchBoostUnits,
  calculatePerformanceAdjustment,
  calculateRandomVariationUnits,
} from "../src/domain/signatureShoes.ts";
import type { Career } from "../src/types/career.ts";
import type { Game } from "../src/types/game.ts";
import type {
  SignatureShoe,
  SignatureShoeLaunchMutation,
} from "../src/types/signature-shoe.ts";
import type { SponsorTier } from "../src/types/sponsor.ts";

const now = () => new Date().toISOString();
const mediaExtensions = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
} as const;

export class SignatureShoeError extends Error {}

export function migrateSignatureShoes(db: DatabaseSync) {
  db.exec(`CREATE TABLE IF NOT EXISTS signature_shoes (
    id TEXT PRIMARY KEY, career_id TEXT NOT NULL REFERENCES careers(id),
    contract_id TEXT NOT NULL REFERENCES sponsor_contracts(id), brand_id TEXT NOT NULL,
    brand_name TEXT NOT NULL, tier TEXT NOT NULL, slot INTEGER NOT NULL CHECK(slot IN (1,2)),
    name TEXT, image_path TEXT, retail_price_usd_cents INTEGER, royalty_rate REAL,
    status TEXT NOT NULL CHECK(status IN ('pendingLaunch','active','contractEnded','cancelled')),
    unlocked_at TEXT NOT NULL, launched_at TEXT, launch_games_processed INTEGER NOT NULL DEFAULT 0,
    lifetime_units_sold INTEGER NOT NULL DEFAULT 0, lifetime_revenue_usd_cents INTEGER NOT NULL DEFAULT 0,
    lifetime_royalties_usd_cents INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    UNIQUE(contract_id, slot)
  );
  CREATE INDEX IF NOT EXISTS signature_shoes_career_status ON signature_shoes(career_id,status);
  CREATE INDEX IF NOT EXISTS signature_shoes_contract ON signature_shoes(contract_id);
  CREATE TABLE IF NOT EXISTS signature_shoe_game_sales (
    id TEXT PRIMARY KEY, career_id TEXT NOT NULL REFERENCES careers(id), shoe_id TEXT NOT NULL REFERENCES signature_shoes(id),
    contract_id TEXT NOT NULL REFERENCES sponsor_contracts(id), brand_id TEXT NOT NULL,
    game_id TEXT NOT NULL REFERENCES games(id), game_date TEXT NOT NULL, units_sold INTEGER NOT NULL,
    revenue_usd_cents INTEGER NOT NULL, royalty_rate REAL NOT NULL, royalty_paid_usd_cents INTEGER NOT NULL,
    base_units INTEGER NOT NULL, follower_units INTEGER NOT NULL, launch_boost_units INTEGER NOT NULL,
    random_variation_units INTEGER NOT NULL, performance_adjustment REAL NOT NULL, created_at TEXT NOT NULL,
    UNIQUE(shoe_id, game_id)
  );
  CREATE INDEX IF NOT EXISTS signature_shoe_sales_career_game ON signature_shoe_game_sales(career_id,game_id);
  CREATE INDEX IF NOT EXISTS signature_shoe_sales_contract ON signature_shoe_game_sales(contract_id);
  CREATE TABLE IF NOT EXISTS signature_shoe_launch_requests (
    career_id TEXT NOT NULL REFERENCES careers(id), request_id TEXT NOT NULL, shoe_id TEXT NOT NULL REFERENCES signature_shoes(id),
    completed_at TEXT NOT NULL, PRIMARY KEY(career_id,request_id)
  );`);
}

function validImage(mediaType: string, buffer: Buffer) {
  if (mediaType === "image/png")
    return buffer
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mediaType === "image/jpeg")
    return buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255;
  return (
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  );
}

export class SignatureShoeService {
  readonly db: DatabaseSync;
  readonly random: () => number;
  readonly imageRoot: string;
  constructor(
    db: DatabaseSync,
    random: () => number = Math.random,
    imageRoot = join(process.cwd(), ".2klife", "signature-shoes"),
  ) {
    this.db = db;
    this.random = random;
    this.imageRoot = imageRoot;
    migrateSignatureShoes(db);
  }

  private fromRow(row: Record<string, unknown>): SignatureShoe {
    const imagePath = row.image_path ? String(row.image_path) : null;
    return {
      id: String(row.id),
      careerId: String(row.career_id),
      contractId: String(row.contract_id),
      brandId: String(row.brand_id),
      brandName: String(row.brand_name),
      tier: String(row.tier) as SponsorTier,
      slot: Number(row.slot) as 1 | 2,
      name: row.name ? String(row.name) : null,
      imagePath,
      imageUrl: imagePath
        ? `/api/careers/${row.career_id}/signature-shoes/${row.id}/image`
        : null,
      retailPriceUsdCents:
        row.retail_price_usd_cents === null
          ? null
          : Number(row.retail_price_usd_cents),
      royaltyRate: row.royalty_rate === null ? null : Number(row.royalty_rate),
      status: String(row.status) as SignatureShoe["status"],
      unlockedAt: String(row.unlocked_at),
      launchedAt: row.launched_at ? String(row.launched_at) : null,
      launchGamesProcessed: Number(row.launch_games_processed),
      lifetimeUnitsSold: Number(row.lifetime_units_sold),
      lifetimeRevenueUsdCents: Number(row.lifetime_revenue_usd_cents),
      lifetimeRoyaltiesUsdCents: Number(row.lifetime_royalties_usd_cents),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  get(careerId: string, shoeId: string) {
    const row = this.db
      .prepare("SELECT * FROM signature_shoes WHERE career_id=? AND id=?")
      .get(careerId, shoeId);
    return row ? this.fromRow(row as Record<string, unknown>) : null;
  }

  list(careerId: string) {
    return this.db
      .prepare(
        "SELECT * FROM signature_shoes WHERE career_id=? AND status<>'cancelled' ORDER BY unlocked_at DESC,slot DESC",
      )
      .all(careerId)
      .map((row) => this.fromRow(row as Record<string, unknown>));
  }

  pending(careerId: string) {
    return this.db
      .prepare(
        "SELECT * FROM signature_shoes WHERE career_id=? AND status='pendingLaunch' ORDER BY unlocked_at,slot",
      )
      .all(careerId)
      .map((row) => this.fromRow(row as Record<string, unknown>));
  }

  unlockForAttendance(
    careerId: string,
    contractId: string,
    attendanceAfter: number,
    inGameDate: string,
  ) {
    if (attendanceAfter !== 1 && attendanceAfter !== 2) return null;
    const contract = this.db
      .prepare(
        "SELECT * FROM sponsor_contracts WHERE career_id=? AND id=? AND status='active' AND category='footwear'",
      )
      .get(careerId, contractId);
    if (!contract) return null;
    const timestamp = now(),
      id = randomUUID();
    this.db
      .prepare(
        `INSERT OR IGNORE INTO signature_shoes
      (id,career_id,contract_id,brand_id,brand_name,tier,slot,status,unlocked_at,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,'pendingLaunch',?,?,?)`,
      )
      .run(
        id,
        careerId,
        contractId,
        contract.brand_id,
        contract.brand_name,
        contract.tier,
        attendanceAfter,
        inGameDate,
        timestamp,
        timestamp,
      );
    const row = this.db
      .prepare(
        "SELECT * FROM signature_shoes WHERE career_id=? AND contract_id=? AND slot=?",
      )
      .get(careerId, contractId, attendanceAfter)!;
    return this.fromRow(row as Record<string, unknown>);
  }

  launch(
    career: Career,
    shoeId: string,
    mutation: SignatureShoeLaunchMutation,
  ) {
    if (!/^[\w-]{20,80}$/.test(mutation.requestId))
      throw new SignatureShoeError("Invalid launch request. Reload and retry.");
    const name = typeof mutation.name === "string" ? mutation.name.trim() : "";
    if (!name)
      throw new SignatureShoeError("Enter a name for the signature shoe.");
    if (name.length > SIGNATURE_SHOE_NAME_MAX_LENGTH)
      throw new SignatureShoeError(
        `Shoe names must be at most ${SIGNATURE_SHOE_NAME_MAX_LENGTH} characters.`,
      );
    if (!career.currentDate)
      throw new SignatureShoeError(
        "Set the current in-game date before launching a signature shoe.",
      );
    let buffer: Buffer | null = null,
      extension = "";
    if (mutation.image) {
      if (
        !SIGNATURE_SHOE_IMAGE_TYPES.includes(
          mutation.image
            .mediaType as (typeof SIGNATURE_SHOE_IMAGE_TYPES)[number],
        ) ||
        typeof mutation.image.data !== "string" ||
        !/^[A-Za-z0-9+/]+={0,2}$/.test(mutation.image.data)
      )
        throw new SignatureShoeError(
          "Invalid image format. Use PNG, JPEG, or WebP.",
        );
      buffer = Buffer.from(mutation.image.data, "base64");
      if (
        !buffer.length ||
        buffer.length > SIGNATURE_SHOE_IMAGE_MAX_BYTES ||
        buffer.toString("base64") !== mutation.image.data ||
        !validImage(mutation.image.mediaType, buffer)
      )
        throw new SignatureShoeError(
          "The shoe image must be a valid PNG, JPEG, or WebP file no larger than 4 MiB.",
        );
      extension =
        mediaExtensions[
          mutation.image.mediaType as keyof typeof mediaExtensions
        ];
    }
    let writtenPath: string | null = null;
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const prior = this.db
        .prepare(
          "SELECT shoe_id FROM signature_shoe_launch_requests WHERE career_id=? AND request_id=?",
        )
        .get(career.id, mutation.requestId);
      if (prior) {
        if (String(prior.shoe_id) !== shoeId)
          throw new SignatureShoeError(
            "This launch request identifier was already used.",
          );
        const existing = this.get(career.id, shoeId)!;
        this.db.exec("COMMIT");
        return existing;
      }
      const row = this.db
        .prepare(
          `SELECT s.* FROM signature_shoes s JOIN sponsor_contracts c ON c.id=s.contract_id
        WHERE s.career_id=? AND s.id=? AND s.status='pendingLaunch' AND c.status='active' AND c.category='footwear'`,
        )
        .get(career.id, shoeId);
      if (!row)
        throw new SignatureShoeError(
          "This signature shoe is no longer available to launch.",
        );
      const terms = SHOE_TERMS_BY_TIER[String(row.tier) as SponsorTier];
      let imagePath: string | null = null;
      if (buffer) {
        const directory = join(this.imageRoot, career.id);
        mkdirSync(directory, { recursive: true });
        writtenPath = join(directory, `${shoeId}${extension}`);
        writeFileSync(writtenPath, buffer, { mode: 0o600 });
        imagePath = `${career.id}/${shoeId}${extension}`;
      }
      const timestamp = now();
      this.db
        .prepare(
          `UPDATE signature_shoes SET name=?,image_path=?,retail_price_usd_cents=?,royalty_rate=?,
        status='active',launched_at=?,updated_at=? WHERE career_id=? AND id=? AND status='pendingLaunch'`,
        )
        .run(
          name,
          imagePath,
          terms.retailPriceUsdCents,
          terms.royaltyRate,
          career.currentDate,
          timestamp,
          career.id,
          shoeId,
        );
      this.db
        .prepare("INSERT INTO signature_shoe_launch_requests VALUES (?,?,?,?)")
        .run(career.id, mutation.requestId, shoeId, timestamp);
      const launched = this.get(career.id, shoeId)!;
      this.db.exec("COMMIT");
      return launched;
    } catch (error) {
      this.db.exec("ROLLBACK");
      if (writtenPath)
        try {
          unlinkSync(writtenPath);
        } catch {
          /* best-effort cleanup */
        }
      throw error;
    }
  }

  processCompletedGame(career: Career, game: Game) {
    if (game.status !== "completed") return;
    const contracts = this.db
      .prepare(
        `SELECT * FROM sponsor_contracts WHERE career_id=? AND status='active' AND category='footwear' ORDER BY id`,
      )
      .all(career.id);
    const earlierGames = career.season.games.filter(
      (item) => item.id !== game.id && item.date < game.date,
    );
    const adjustment = calculatePerformanceAdjustment(game, earlierGames);
    for (const contract of contracts) {
      const shoes = this.db
        .prepare(
          "SELECT * FROM signature_shoes WHERE career_id=? AND contract_id=? AND status='active' ORDER BY slot",
        )
        .all(career.id, contract.id) as Record<string, unknown>[];
      if (!shoes.length) continue;
      if (
        this.db
          .prepare(
            "SELECT 1 FROM signature_shoe_game_sales WHERE contract_id=? AND game_id=? LIMIT 1",
          )
          .get(String(contract.id), game.id)
      )
        continue;
      const terms = SHOE_TERMS_BY_TIER[String(contract.tier) as SponsorTier];
      const follower = calculateFollowerUnits(
        career.profile.socialMedia.currentFollowers,
        terms,
        this.random,
      );
      const boosts = shoes.map((shoe) =>
        Number(shoe.launch_games_processed) < 3
          ? calculateLaunchBoostUnits(terms, this.random).units
          : 0,
      );
      const variation = calculateRandomVariationUnits(terms, this.random);
      const totalUnits = Math.max(
        0,
        Math.round(
          (terms.baseUnits +
            follower.units +
            variation.units +
            boosts.reduce((sum, value) => sum + value, 0)) *
            (1 + adjustment),
        ),
      );
      const secondInLaunch =
        shoes.length > 1 && Number(shoes[1].launch_games_processed) < 3;
      const allocations = allocateShoeUnits(
        totalUnits,
        shoes.length > 1,
        secondInLaunch,
      );
      for (const [index, shoe] of shoes.entries()) {
        const units = allocations[index] ?? 0;
        const revenue = units * Number(shoe.retail_price_usd_cents);
        const royalty = Math.round(revenue * Number(shoe.royalty_rate));
        const timestamp = now(),
          saleId = randomUUID();
        const inserted = this.db
          .prepare(
            `INSERT OR IGNORE INTO signature_shoe_game_sales
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          )
          .run(
            saleId,
            career.id,
            String(shoe.id),
            String(contract.id),
            String(contract.brand_id),
            game.id,
            game.date,
            units,
            revenue,
            Number(shoe.royalty_rate),
            royalty,
            terms.baseUnits,
            follower.units,
            boosts[index] ?? 0,
            variation.units,
            adjustment,
            timestamp,
          );
        if (!inserted.changes) continue;
        this.db
          .prepare(
            `UPDATE signature_shoes SET launch_games_processed=launch_games_processed+1,
          lifetime_units_sold=lifetime_units_sold+?,lifetime_revenue_usd_cents=lifetime_revenue_usd_cents+?,
          lifetime_royalties_usd_cents=lifetime_royalties_usd_cents+?,updated_at=? WHERE id=?`,
          )
          .run(units, revenue, royalty, timestamp, String(shoe.id));
        if (royalty > 0)
          this.db
            .prepare(
              `INSERT OR IGNORE INTO financial_transactions
          (id,career_id,amount_usd_cents,currency,in_game_date,recorded_at,origin_type,origin_reference,reason,brand_id,contract_id,game_id,shoe_reference,idempotency_key,description,settlement_metadata)
          VALUES (?,?,?,'USD',?,?,'brand',?,'royalties',?,?,?,?,?,?,?)`,
            )
            .run(
              randomUUID(),
              career.id,
              royalty,
              game.date,
              timestamp,
              String(contract.brand_id),
              String(contract.brand_id),
              String(contract.id),
              game.id,
              String(shoe.id),
              `shoe:${shoe.id}:game:${game.id}:royalty`,
              `${shoe.name} shoe royalties`,
              JSON.stringify({
                saleId,
                unitsSold: units,
                revenueUsdCents: revenue,
                royaltyRate: Number(shoe.royalty_rate),
              }),
            );
      }
    }
  }

  expireContract(careerId: string, contractId: string, timestamp = now()) {
    this.db
      .prepare(
        "UPDATE signature_shoes SET status='contractEnded',updated_at=? WHERE career_id=? AND contract_id=? AND status='active'",
      )
      .run(timestamp, careerId, contractId);
    this.db
      .prepare(
        "UPDATE signature_shoes SET status='cancelled',updated_at=? WHERE career_id=? AND contract_id=? AND status='pendingLaunch'",
      )
      .run(timestamp, careerId, contractId);
  }

  image(careerId: string, shoeId: string) {
    const shoe = this.get(careerId, shoeId);
    if (!shoe?.imagePath) return null;
    const absolute = resolve(this.imageRoot, shoe.imagePath);
    const root = resolve(this.imageRoot) + sep;
    if (!absolute.startsWith(root)) return null;
    const extension = extname(absolute).toLowerCase();
    const contentType =
      extension === ".png"
        ? "image/png"
        : extension === ".jpg"
          ? "image/jpeg"
          : "image/webp";
    try {
      return { contentType, data: readFileSync(absolute) };
    } catch {
      return null;
    }
  }
}
