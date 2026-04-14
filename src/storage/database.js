import * as SQLite from 'expo-sqlite';
import * as FileSystem from 'expo-file-system/legacy';

let db = null;

export async function backupDatabaseFile() {
  try {
    const dbChoices = ['saleapp.db', 'salesrecorder.db', 'saleapp', 'salesrecorder'];
    const docDir = FileSystem.documentDirectory;
    const possibleDirs = [
      `${docDir}SQLite/`,
      `${docDir}db/`,
      `${docDir}`
    ];

    let actualSource = null;
    let foundName = '';
    for (const dir of possibleDirs) {
      for (const dbName of dbChoices) {
        try {
          const info = await FileSystem.getInfoAsync(`${dir}${dbName}`);
          if (info.exists) {
            actualSource = `${dir}${dbName}`;
            foundName = dbName;
            break;
          }
        } catch (err) {
          // Ignore directory errors
        }
      }
      if (actualSource) break;
    }

    if (!actualSource) {
      // Fallback: check if we can find it in common Android location if previous checks failed
      const androidSQLite = `${docDir}../databases/`;
      for (const dbName of dbChoices) {
        try {
          const info = await FileSystem.getInfoAsync(`${androidSQLite}${dbName}`);
          if (info.exists) {
            actualSource = `${androidSQLite}${dbName}`;
            foundName = dbName;
            break;
          }
        } catch (err) {}
      }
    }

    if (!actualSource) {
      throw new Error(`Database file not found in search paths. Checked names: ${dbChoices.join(', ')}`);
    }

    const backupDir = `${FileSystem.documentDirectory}Backups/`;
    const dirInfo = await FileSystem.getInfoAsync(backupDir);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(backupDir, { intermediates: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_');
    const backupFile = `saleapp_backup_${timestamp}.db`;
    
    await FileSystem.copyAsync({ from: actualSource, to: `${backupDir}${backupFile}` });
    
    // Rotate backups: keep only 30 most recent
    const files = await FileSystem.readDirectoryAsync(backupDir);
    const dbFiles = files.filter(f => f.endsWith('.db')).sort(); // Alphabetical sort puts older dates first
    if (dbFiles.length > 30) {
      const toDelete = dbFiles.slice(0, dbFiles.length - 30);
      for (const oldFile of toDelete) {
        try {
          await FileSystem.deleteAsync(`${backupDir}${oldFile}`, { idempotent: true });
        } catch (err) {
          console.warn('[SaleApp] Could not rotate backup:', oldFile);
        }
      }
    }

    return { success: true, fileName: backupFile };
  } catch (e) {
    console.error('[SaleApp] Backup error:', e);
    throw e;
  }
}

export async function getInternalBackups() {
  const backupDir = `${FileSystem.documentDirectory}Backups/`;
  const dirInfo = await FileSystem.getInfoAsync(backupDir);
  if (!dirInfo.exists) return [];
  const files = await FileSystem.readDirectoryAsync(backupDir);
  return files.filter(f => f.endsWith('.db')).sort().reverse();
}

export async function closeDB() {
  if (db) {
    try {
      await db.closeAsync();
      db = null;
    } catch (e) {
      console.error('[SaleApp] Error closing database:', e);
    }
  }
}

export async function restoreDatabaseFromUri(sourceUri) {
  try {
    // 1. Close current connection
    await closeDB();

    // 2. Ensure target directory exists
    const sqliteDir = `${FileSystem.documentDirectory}SQLite/`;
    const dirInfo = await FileSystem.getInfoAsync(sqliteDir);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(sqliteDir, { intermediates: true });
    }

    // 3. Copy source to current db name
    const targetPath = `${sqliteDir}saleapp.db`;
    await FileSystem.copyAsync({ from: sourceUri, to: targetPath });

    // 4. Re-initialize
    await initDB();
    
    return { success: true };
  } catch (e) {
    console.error('[SaleApp] Restore error:', e);
    throw e;
  }
}

export async function resetData(includeBackups = false) {
  try {
    // 1. Close current connection
    await closeDB();

    // 2. Locate current db file
    const dbPath = `${FileSystem.documentDirectory}SQLite/saleapp.db`;
    const info = await FileSystem.getInfoAsync(dbPath);
    
    // 3. Delete the file if it exists
    if (info.exists) {
      await FileSystem.deleteAsync(dbPath);
    }

    // 4. Optionally clear backups
    if (includeBackups) {
      try {
        const backupDir = `${FileSystem.documentDirectory}Backups/`;
        const bDirInfo = await FileSystem.getInfoAsync(backupDir);
        if (bDirInfo.exists) {
          await FileSystem.deleteAsync(backupDir, { idempotent: true });
        }
      } catch (err) {
        console.warn('[SaleApp] Backup cleanup error:', err);
      }
    }

    // 5. Re-initialize empty db
    await initDB();
    
    return { success: true };
  } catch (e) {
    console.error('[SaleApp] Reset error:', e);
    throw e;
  }
}

// Open and initialise the database (call once at app startup)
export async function initDB() {
  if (db) return db;
  try {
    const dbName = 'saleapp.db';
    const legacyName = 'salesrecorder.db';
    
    // Migration: If legacy file exists and new one doesn't, move it
    try {
      const sqliteDir = `${FileSystem.documentDirectory}SQLite/`;
      const oldPath = `${sqliteDir}${legacyName}`;
      const newPath = `${sqliteDir}${dbName}`;
      
      const oldInfo = await FileSystem.getInfoAsync(oldPath);
      if (oldInfo.exists) {
        const newInfo = await FileSystem.getInfoAsync(newPath);
        if (!newInfo.exists) {
          console.log('[SaleApp] Migrating database from salesrecorder.db to saleapp.db');
          await FileSystem.copyAsync({ from: oldPath, to: newPath });
        }
      }
    } catch (migrateErr) {
      console.warn('[SaleApp] Migration check failed (non-fatal):', migrateErr);
    }

    db = await SQLite.openDatabaseAsync(dbName);
    
    // Create tables independently to ensure one failure doesn't block the rest
    const createTable = async (name, sql) => {
      try {
        await db.execAsync(sql);
      } catch (e) {
        console.error(`[SaleApp] Error creating table ${name}:`, e.message);
      }
    };

    await createTable('sales', `
      CREATE TABLE IF NOT EXISTS sales (
        id TEXT PRIMARY KEY NOT NULL,
        amount REAL NOT NULL,
        date TEXT NOT NULL,
        date_iso TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'deposit',
        note TEXT DEFAULT '',
        recorded_at TEXT NOT NULL
      );
    `);

    await createTable('savings', `
      CREATE TABLE IF NOT EXISTS savings (
        id TEXT PRIMARY KEY NOT NULL,
        amount REAL NOT NULL,
        date_iso TEXT NOT NULL,
        type TEXT NOT NULL,
        note TEXT DEFAULT '',
        recorded_at TEXT NOT NULL
      );
    `);

    await createTable('creditors', `
      CREATE TABLE IF NOT EXISTS creditors (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        phone TEXT,
        address TEXT,
        amount REAL NOT NULL,
        balance REAL NOT NULL,
        due_date TEXT,
        note TEXT,
        recorded_at TEXT NOT NULL,
        is_whatsapp INTEGER NOT NULL DEFAULT 0
      );
    `);

    await createTable('creditor_payments', `
      CREATE TABLE IF NOT EXISTS creditor_payments (
        id TEXT PRIMARY KEY NOT NULL,
        creditor_id TEXT NOT NULL,
        amount REAL NOT NULL,
        date_iso TEXT NOT NULL,
        note TEXT DEFAULT '',
        recorded_at TEXT NOT NULL,
        FOREIGN KEY (creditor_id) REFERENCES creditors (id) ON DELETE CASCADE
      );
    `);

    await createTable('debtors', `
      CREATE TABLE IF NOT EXISTS debtors (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        phone TEXT,
        address TEXT,
        amount REAL NOT NULL,
        balance REAL NOT NULL,
        due_date TEXT,
        note TEXT,
        recorded_at TEXT NOT NULL,
        is_whatsapp INTEGER NOT NULL DEFAULT 0
      );
    `);

    await createTable('debtor_payments', `
      CREATE TABLE IF NOT EXISTS debtor_payments (
        id TEXT PRIMARY KEY NOT NULL,
        debtor_id TEXT NOT NULL,
        amount REAL NOT NULL,
        date_iso TEXT NOT NULL,
        note TEXT DEFAULT '',
        recorded_at TEXT NOT NULL,
        FOREIGN KEY (debtor_id) REFERENCES debtors (id) ON DELETE CASCADE
      );
    `);

    try {
      const info = await db.getAllAsync(`PRAGMA table_info(sales)`);
      if (info && !info.some(c => c.name === 'type')) {
        await db.execAsync(`ALTER TABLE sales ADD COLUMN type TEXT NOT NULL DEFAULT 'deposit'`);
      }
    } catch (e) { }

    try {
      const info = await db.getAllAsync(`PRAGMA table_info(creditors)`);
      if (info && !info.some(c => c.name === 'phone')) {
        await db.execAsync(`ALTER TABLE creditors ADD COLUMN phone TEXT`);
      }
      if (info && !info.some(c => c.name === 'address')) {
        await db.execAsync(`ALTER TABLE creditors ADD COLUMN address TEXT`);
      }
      if (info && !info.some(c => c.name === 'is_whatsapp')) {
        await db.execAsync(`ALTER TABLE creditors ADD COLUMN is_whatsapp INTEGER NOT NULL DEFAULT 0`);
      }
    } catch (e) { }

    try {
      const info = await db.getAllAsync(`PRAGMA table_info(debtors)`);
      if (info && !info.some(c => c.name === 'phone')) {
        await db.execAsync(`ALTER TABLE debtors ADD COLUMN phone TEXT`);
      }
      if (info && !info.some(c => c.name === 'address')) {
        await db.execAsync(`ALTER TABLE debtors ADD COLUMN address TEXT`);
      }
      if (info && !info.some(c => c.name === 'is_whatsapp')) {
        await db.execAsync(`ALTER TABLE debtors ADD COLUMN is_whatsapp INTEGER NOT NULL DEFAULT 0`);
      }
    } catch (e) { }

    await createTable('settings', `
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT
      );
    `);

    return db;
  } catch (err) {
    console.error('[SaleApp] DB Init Fatal Error:', err);
    throw err;
  }
}

function getDB() {
  if (!db) throw new Error('Database not initialised. Call initDB() first.');
  return db;
}

// ── CREATE ────────────────────────────────────────────────────────────────────
export async function insertSale({ id, amount, date, dateISO, type, note, recordedAt }) {
  const d = getDB();
  await d.runAsync(
    `INSERT INTO sales (id, amount, date, date_iso, type, note, recorded_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, amount, date, dateISO, type ?? 'deposit', note ?? '', recordedAt]
  );
}

// ── READ ──────────────────────────────────────────────────────────────────────
export async function getAllSales() {
  const d = getDB();
  const rows = await d.getAllAsync(
    `SELECT * FROM sales ORDER BY date_iso DESC`
  );
  return rows.map(rowToRecord);
}

export async function getSalesByMonth(year, month) {
  const d = getDB();
  // month is 1-indexed
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  const rows = await d.getAllAsync(
    `SELECT * FROM sales WHERE date_iso LIKE ? ORDER BY date_iso DESC`,
    [`${prefix}%`]
  );
  return rows.map(rowToRecord);
}

export async function searchSales(query) {
  const d = getDB();
  const q = `%${query}%`;
  const rows = await d.getAllAsync(
    `SELECT * FROM sales WHERE date LIKE ? OR note LIKE ? ORDER BY date_iso DESC`,
    [q, q]
  );
  return rows.map(rowToRecord);
}

// ── UPDATE ────────────────────────────────────────────────────────────────────
export async function updateSale({ id, amount, date, dateISO, type, note, recordedAt }) {
  const d = getDB();
  await d.runAsync(
    `UPDATE sales SET amount=?, date=?, date_iso=?, type=?, note=?, recorded_at=?
     WHERE id=?`,
    [amount, date, dateISO, type ?? 'deposit', note ?? '', recordedAt, id]
  );
}

// ── DELETE ────────────────────────────────────────────────────────────────────
export async function deleteSale(id) {
  const d = getDB();
  await d.runAsync(`DELETE FROM sales WHERE id=?`, [id]);
}

export async function deleteAllSales() {
  const d = getDB();
  await d.runAsync(`DELETE FROM sales`);
}

// ── SAVINGS OPERATIONS ─────────────────────────────────────────────────────────

export async function insertSaving({ id, amount, dateISO, type, note, recordedAt }) {
  const d = getDB();
  await d.runAsync(
    `INSERT INTO savings (id, amount, date_iso, type, note, recorded_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, amount, dateISO, type, note ?? '', recordedAt]
  );
}

export async function getAllSavings() {
  const d = getDB();
  const rows = await d.getAllAsync(
    `SELECT * FROM savings ORDER BY date_iso DESC`
  );
  return rows.map((r) => ({
    id: r.id,
    amount: r.amount,
    dateISO: r.date_iso,
    type: r.type,
    note: r.note,
    recordedAt: r.recorded_at,
  }));
}

export async function deleteSaving(id) {
  const d = getDB();
  await d.runAsync(`DELETE FROM savings WHERE id=?`, [id]);
}

export async function updateSaving({ id, amount, dateISO, type, note, recordedAt }) {
  const d = getDB();
  await d.runAsync(
    `UPDATE savings SET amount=?, date_iso=?, type=?, note=?, recorded_at=?
     WHERE id=?`,
    [amount, dateISO, type, note ?? '', recordedAt, id]
  );
}

/**
 * Returns current total savings balance by calculating SUM(deposits) - SUM(withdrawals)
 */
export async function getSavingsStats(year = null, month = null) {
  const d = getDB();
  let query = `
    SELECT
      SUM(CASE WHEN type = 'deposit' THEN amount ELSE 0 END) AS total_deposits,
      SUM(CASE WHEN type = 'withdrawal' THEN amount ELSE 0 END) AS total_withdrawals,
      COUNT(*) AS total_transactions
    FROM savings
  `;
  const params = [];
  if (year && month !== null) {
    query += ` WHERE date_iso LIKE ?`;
    if (month === -1) {
      params.push(`${year}-%`);
    } else {
      params.push(`${year}-${String(month + 1).padStart(2, '0')}%`);
    }
  }

  const [res] = await d.getAllAsync(query, params);

  const deposits    = res.total_deposits    ?? 0;
  const withdrawals = res.total_withdrawals ?? 0;

  return {
    balance:          deposits - withdrawals,
    totalDeposits:    deposits,
    totalWithdrawals: withdrawals,
    count:            res.total_transactions ?? 0,
  };
}

// ── STATS (aggregated in SQL for performance) ─────────────────────────────────
export async function getSalesStats(year = null, month = null) {
  const d = getDB();
  
  let query = `
    SELECT
      COUNT(DISTINCT date_iso) AS total_days,
      SUM(CASE WHEN type = 'withdrawal' THEN -amount ELSE amount END) AS total_amount,
      AVG(CASE WHEN type = 'withdrawal' THEN -amount ELSE amount END) AS avg_amount,
      MAX(CASE WHEN type = 'deposit' THEN amount ELSE 0 END) AS max_amount,
      MIN(CASE WHEN type = 'deposit' THEN amount ELSE amount END) AS min_amount
    FROM sales
  `;
  const params = [];
  if (year && month !== null) {
    query += ` WHERE date_iso LIKE ?`;
    if (month === -1) {
      params.push(`${year}-%`);
    } else {
      params.push(`${year}-${String(month + 1).padStart(2, '0')}%`);
    }
  }

  const [totals] = await d.getAllAsync(query, params);

  const now = new Date();
  const ym  = (y, m) => `${y}-${String(m).padStart(2, '0')}`;
  const curPrefix  = ym(now.getFullYear(), now.getMonth() + 1);
  const prevMonth  = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevPrefix = ym(prevMonth.getFullYear(), prevMonth.getMonth() + 1);
  const yearPrefix = `${now.getFullYear()}`;

  const sqlSum = `SUM(CASE WHEN type = 'withdrawal' THEN -amount ELSE amount END) AS s, COUNT(*) AS c FROM sales WHERE date_iso LIKE ?`;
  const [[thisMonth], [lastMonth], [thisYear]] = await Promise.all([
    d.getAllAsync(`SELECT ` + sqlSum, [`${curPrefix}%`]),
    d.getAllAsync(`SELECT ` + sqlSum, [`${prevPrefix}%`]),
    d.getAllAsync(`SELECT ` + sqlSum, [`${yearPrefix}%`]),
  ]);

  return {
    totalDays:       totals.total_days    ?? 0,
    totalAmount:     totals.total_amount  ?? 0,
    avgAmount:       totals.avg_amount    ?? 0,
    maxAmount:       totals.max_amount    ?? 0,
    minAmount:       totals.min_amount    ?? 0,
    thisMonthAmount: thisMonth.s          ?? 0,
    thisMonthDays:   thisMonth.c          ?? 0,
    lastMonthAmount: lastMonth.s          ?? 0,
    lastMonthDays:   lastMonth.c          ?? 0,
    thisYearAmount:  thisYear.s           ?? 0,
    thisYearDays:    thisYear.c           ?? 0,
  };
}

/**
 * Gets a combined list of recent activity from both sales and savings tables.
 */
export async function getRecentActivity(limit = 10, year = null, month = null) {
  const d = getDB();
  const ym = (year && month !== null && month !== -1) 
    ? `${year}-${String(month + 1).padStart(2, '0')}` 
    : (year && month === -1 ? `${year}` : null);
  const filter = ym ? ` WHERE date_iso LIKE ?` : '';
  const params = ym ? [`${ym}%`] : [];
  
  try {
    const salesPromise = d.getAllAsync(`
      SELECT id, (CASE WHEN type='withdrawal' THEN -amount ELSE amount END) AS amount, date_iso, note, recorded_at, 'sale' AS kind 
      FROM sales ${filter} ORDER BY recorded_at DESC LIMIT ?`, [...params, limit]).catch(() => []);

    const savingsPromise = d.getAllAsync(`
      SELECT id, (CASE WHEN type='withdrawal' THEN -amount ELSE amount END) AS amount, date_iso, (type || ': ' || note) AS note, recorded_at, 'saving' AS kind 
      FROM savings ${filter} ORDER BY recorded_at DESC LIMIT ?`, [...params, limit]).catch(() => []);

    const creditorPromise = d.getAllAsync(`
      SELECT p.id, -p.amount AS amount, p.date_iso, ('To: ' || c.name || ' - ' || p.note) AS note, p.recorded_at, 'creditor' AS kind 
      FROM creditor_payments p
      JOIN creditors c ON p.creditor_id = c.id
      ${ym ? 'WHERE p.date_iso LIKE ?' : ''}
      ORDER BY p.recorded_at DESC LIMIT ?`, ym ? [`${ym}%`, limit] : [limit]).catch(() => []);

    const debtorPromise = d.getAllAsync(`
      SELECT p.id, p.amount AS amount, p.date_iso, ('From: ' || d.name || ' - ' || p.note) AS note, p.recorded_at, 'debtor' AS kind 
      FROM debtor_payments p
      JOIN debtors d ON p.debtor_id = d.id
      ${ym ? 'WHERE p.date_iso LIKE ?' : ''}
      ORDER BY p.recorded_at DESC LIMIT ?`, ym ? [`${ym}%`, limit] : [limit]).catch(() => []);

    const results = await Promise.all([salesPromise, savingsPromise, creditorPromise, debtorPromise]);
    const combined = results.flat();

    // Sort by date_iso desc primarily, then recordedAt
    combined.sort((a,b) => {
      const dateA = new Date(a.date_iso || a.dateISO);
      const dateB = new Date(b.date_iso || b.dateISO);
      if (dateB - dateA !== 0) return dateB - dateA;
      return new Date(b.recorded_at || b.recordedAt) - new Date(a.recorded_at || a.recordedAt);
    });

    return combined.slice(0, limit).map(r => ({
      id: r.id,
      amount: r.amount,
      dateISO: r.date_iso,
      note: r.note,
      recordedAt: r.recorded_at,
      kind: r.kind
    }));
  } catch (e) {
    console.error('[Sales App] Recent activity error:', e);
    return [];
  }
}

/**
 * Gets stats specifically for today's performance.
 */
/**
 * Gets stats for a specific period (or today if no period provided).
 */
export async function getPeriodSummaryStats(year = null, month = null) {
  const d = getDB();
  const now = new Date();
  const isCurrent = (year === null || (year === now.getFullYear() && month === now.getMonth()));
  
  let prefix;
  if (isCurrent) {
    prefix = now.toISOString().split('T')[0]; // Focus on today
  } else if (month === -1) {
    prefix = `${year}-`; // Focus on the whole year
  } else {
    prefix = `${year}-${String(month + 1).padStart(2, '0')}`; // Focus on the whole month
  }
  
  const [sales] = await d.getAllAsync(
    `SELECT SUM(CASE WHEN type='withdrawal' THEN -amount ELSE amount END) as s, COUNT(*) as c FROM sales WHERE date_iso LIKE ?`, 
    [`${prefix}%`]
  );

  const [savings] = await d.getAllAsync(
    `SELECT 
      SUM(CASE WHEN type='deposit' THEN amount ELSE 0 END) as d,
      SUM(CASE WHEN type='withdrawal' THEN amount ELSE 0 END) as w
     FROM savings WHERE date_iso LIKE ?`,
    [`${prefix}%`]
  );

  return {
    salesSum:   sales.s   ?? 0,
    savingsSum: (savings.d ?? 0) - (savings.w ?? 0),
    isToday:    isCurrent
  };
}

// ── CREDITORS ─────────────────────────────────────────────────────────────────
export async function insertCreditor({ id, name, phone, address, amount, balance, duedate, note, recordedAt, isWhatsapp }) {
  const d = getDB();
  await d.runAsync(
    `INSERT INTO creditors (id, name, phone, address, amount, balance, due_date, note, recorded_at, is_whatsapp)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, name, phone ?? '', address ?? '', amount, balance, duedate, note ?? '', recordedAt, isWhatsapp ? 1 : 0]
  );
}

export async function updateCreditor({ id, name, phone, address, amount, balance, duedate, note, isWhatsapp }) {
  const d = getDB();
  await d.runAsync(
    `UPDATE creditors SET name=?, phone=?, address=?, amount=?, balance=?, due_date=?, note=?, is_whatsapp=? WHERE id=?`,
    [name, phone ?? '', address ?? '', amount, balance, duedate, note ?? '', isWhatsapp ? 1 : 0, id]
  );
}

export async function deleteCreditor(id) {
  const d = getDB();
  await d.runAsync(`DELETE FROM creditors WHERE id = ?`, [id]);
}

export async function getAllCreditors() {
  const d = getDB();
  const rows = await d.getAllAsync(
    `SELECT * FROM creditors ORDER BY recorded_at DESC`
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    phone: r.phone,
    isWhatsapp: r.is_whatsapp === 1,
    address: r.address,
    amount: r.amount,
    balance: r.balance,
    duedate: r.due_date,
    note: r.note,
    recordedAt: r.recorded_at,
  }));
}

export async function getCreditorById(id) {
  const d = getDB();
  const row = await d.getFirstAsync(`SELECT * FROM creditors WHERE id = ?`, [id]);
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    isWhatsapp: row.is_whatsapp === 1,
    address: row.address,
    amount: row.amount,
    balance: row.balance,
    duedate: row.due_date,
    note: row.note,
    recordedAt: row.recorded_at,
  };
}

export async function getCreditorStats() {
  const d = getDB();
  const [res] = await d.getAllAsync(`SELECT SUM(balance) as totalBalance, COUNT(*) as count FROM creditors`);
  return {
    totalOwed: res.totalBalance ?? 0,
    count: res.count ?? 0,
  };
}

// ── DEBTORS ───────────────────────────────────────────────────────────────────

export async function insertDebtor({ id, name, phone, address, amount, balance, duedate, note, recordedAt, isWhatsapp }) {
  const d = getDB();
  await d.runAsync(
    `INSERT INTO debtors (id, name, phone, address, amount, balance, due_date, note, recorded_at, is_whatsapp)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, name, phone ?? '', address ?? '', amount, balance, duedate, note ?? '', recordedAt, isWhatsapp ? 1 : 0]
  );
}

export async function updateDebtor({ id, name, phone, address, amount, balance, duedate, note, isWhatsapp }) {
  const d = getDB();
  await d.runAsync(
    `UPDATE debtors SET name=?, phone=?, address=?, amount=?, balance=?, due_date=?, note=?, is_whatsapp=? WHERE id=?`,
    [name, phone ?? '', address ?? '', amount, balance, duedate, note ?? '', isWhatsapp ? 1 : 0, id]
  );
}

export async function deleteDebtor(id) {
  const d = getDB();
  await d.runAsync(`DELETE FROM debtors WHERE id = ?`, [id]);
}

export async function getAllDebtors() {
  const d = getDB();
  const rows = await d.getAllAsync(
    `SELECT * FROM debtors ORDER BY recorded_at DESC`
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    phone: r.phone,
    isWhatsapp: r.is_whatsapp === 1,
    address: r.address,
    amount: r.amount,
    balance: r.balance,
    duedate: r.due_date,
    note: r.note,
    recordedAt: r.recorded_at,
  }));
}

export async function getDebtorById(id) {
  const d = getDB();
  const row = await d.getFirstAsync(`SELECT * FROM debtors WHERE id = ?`, [id]);
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    isWhatsapp: row.is_whatsapp === 1,
    address: row.address,
    amount: row.amount,
    balance: row.balance,
    duedate: row.due_date,
    note: row.note,
    recordedAt: row.recorded_at,
  };
}

export async function getDebtorStats() {
  const d = getDB();
  const [res] = await d.getAllAsync(`SELECT SUM(balance) as totalBalance, COUNT(*) as count FROM debtors`);
  return {
    totalOwed: res.totalBalance ?? 0,
    count: res.count ?? 0,
  };
}

// ── CREDITOR PAYMENTS ──────────────────────────────────────────────────────────

export async function insertCreditorPayment({ id, creditorId, amount, dateISO, note, recordedAt }) {
  const d = getDB();
  
  // Start transaction to ensure balance is updated
  await d.runAsync('BEGIN TRANSACTION');
  try {
    // 1. Insert payment record
    await d.runAsync(
      `INSERT INTO creditor_payments (id, creditor_id, amount, date_iso, note, recorded_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, creditorId, amount, dateISO, note ?? '', recordedAt]
    );

    // 2. Decrement balance in creditors table
    await d.runAsync(
      `UPDATE creditors SET balance = balance - ? WHERE id = ?`,
      [amount, creditorId]
    );

    await d.runAsync('COMMIT');
  } catch (error) {
    await d.runAsync('ROLLBACK');
    throw error;
  }
}

export async function getPaymentsForCreditor(creditorId) {
  const d = getDB();
  const rows = await d.getAllAsync(
    `SELECT * FROM creditor_payments WHERE creditor_id = ? ORDER BY date_iso DESC`,
    [creditorId]
  );
  return rows.map(r => ({
    id: r.id,
    creditorId: r.creditor_id,
    amount: r.amount,
    dateISO: r.date_iso,
    note: r.note,
    recordedAt: r.recorded_at
  }));
}

export async function deleteCreditorPayment(paymentId, creditorId, amount) {
  const d = getDB();
  await d.runAsync('BEGIN TRANSACTION');
  try {
    // 1. Delete payment record
    await d.runAsync(`DELETE FROM creditor_payments WHERE id = ?`, [paymentId]);

    // 2. Revert balance in creditors table
    await d.runAsync('UPDATE creditors SET balance = balance + ? WHERE id = ?', [amount, creditorId]);
    await d.runAsync('COMMIT');
  } catch (error) {
    await d.runAsync('ROLLBACK');
    throw error;
  }
}

export async function updateCreditorPayment({ id, creditorId, amount, oldAmount, dateISO, note }) {
  const d = getDB();
  await d.runAsync('BEGIN TRANSACTION');
  try {
    await d.runAsync(
      `UPDATE creditor_payments SET amount=?, date_iso=?, note=? WHERE id=?`,
      [amount, dateISO, note ?? '', id]
    );

    const diff = amount - oldAmount;
    await d.runAsync(
      `UPDATE creditors SET balance = balance - ? WHERE id = ?`,
      [diff, creditorId]
    );

    await d.runAsync('COMMIT');
  } catch (error) {
    await d.runAsync('ROLLBACK');
    throw error;
  }
}

// ── DEBTOR PAYMENTS ──────────────────────────────────────────────────────────

export async function insertDebtorPayment({ id, debtorId, amount, dateISO, note, recordedAt }) {
  const d = getDB();
  await d.runAsync('BEGIN TRANSACTION');
  try {
    await d.runAsync(
      `INSERT INTO debtor_payments (id, debtor_id, amount, date_iso, note, recorded_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, debtorId, amount, dateISO, note ?? '', recordedAt]
    );
    await d.runAsync(
      `UPDATE debtors SET balance = balance - ? WHERE id = ?`,
      [amount, debtorId]
    );
    await d.runAsync('COMMIT');
  } catch (error) {
    await d.runAsync('ROLLBACK');
    throw error;
  }
}

export async function getPaymentsForDebtor(debtorId) {
  const d = getDB();
  const rows = await d.getAllAsync(
    `SELECT * FROM debtor_payments WHERE debtor_id = ? ORDER BY date_iso DESC`,
    [debtorId]
  );
  return rows.map(r => ({
    id: r.id,
    debtorId: r.debtor_id,
    amount: r.amount,
    dateISO: r.date_iso,
    note: r.note,
    recordedAt: r.recorded_at
  }));
}

export async function deleteDebtorPayment(paymentId, debtorId, amount) {
  const d = getDB();
  await d.runAsync('BEGIN TRANSACTION');
  try {
    await d.runAsync(`DELETE FROM debtor_payments WHERE id = ?`, [paymentId]);
    await d.runAsync(
      `UPDATE debtors SET balance = balance + ? WHERE id = ?`,
      [amount, debtorId]
    );
    await d.runAsync('COMMIT');
  } catch (error) {
    await d.runAsync('ROLLBACK');
    throw error;
  }
}

export async function updateDebtorPayment({ id, debtorId, amount, oldAmount, dateISO, note }) {
  const d = getDB();
  await d.runAsync('BEGIN TRANSACTION');
  try {
    await d.runAsync(
      `UPDATE debtor_payments SET amount=?, date_iso=?, note=? WHERE id=?`,
      [amount, dateISO, note ?? '', id]
    );

    const diff = amount - oldAmount;
    await d.runAsync(
      `UPDATE debtors SET balance = balance - ? WHERE id = ?`,
      [diff, debtorId]
    );

    await d.runAsync('COMMIT');
  } catch (error) {
    await d.runAsync('ROLLBACK');
    throw error;
  }
}

// ── SETTINGS ──────────────────────────────────────────────────────────────────
export async function updateSetting(key, value) {
  const d = getDB();
  await d.runAsync(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`, [key, value]);
}

export async function getSetting(key, defaultValue = null) {
  const d = getDB();
  const row = await d.getFirstAsync(`SELECT value FROM settings WHERE key = ?`, [key]);
  return row ? row.value : defaultValue;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function rowToRecord(row) {
  return {
    id:         row.id,
    amount:     row.amount,
    date:       row.date,
    dateISO:    row.date_iso,
    type:       row.type ?? 'deposit',
    note:       row.note,
    recordedAt: row.recorded_at,
  };
}
