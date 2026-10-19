<?php
// ---------------------------------------------------------------------------
// Shared by records.php and admin.php: storage, the rules a record must pass,
// and the tables the game shows. Records are personal bests: one row per
// player (profile UUID) per table, replaced only by a better result.
// ---------------------------------------------------------------------------
declare(strict_types=1);

// Bump together with RECORDS_VERSION in js/data.js when a physics or timing
// change makes old times unfair; older tables stay in the file but are hidden.
const RECORDS_VERSION = 2;

const SEASONS = ['autumn', 'winter', 'spring', 'summer'];
const CARS = ['lotus', 'evo', 'viper'];
const TOP = 10;
const MAX_POINTS = 60;            // four stages × 15
const NAME_MAX = 12;
const RATE_LIMIT = 60;            // submissions per address per hour

// Anything quicker is treated as a cheat. 80% of the autopilot's best with full
// skill (it drives cleanly but not perfectly), and above the flat-out lap time,
// which no lap can beat.
const MIN_LAP = ['autumn' => 35, 'winter' => 34, 'spring' => 37, 'summer' => 39];
const MIN_RACE = ['autumn' => 113, 'winter' => 108, 'spring' => 117, 'summer' => 126];
const MAX_TIME = 1800;

// Computer drivers' names can't be used by players (as in js/data.js).
const AI_DRIVERS = [
    'N. HAWKES', 'A. MORETTI', 'K. TANAKA', 'S. LINDQVIST', 'P. DUVAL',
    'M. KOVAC', 'J. REYES', 'T. BRANDT', 'L. ESPOSITO', 'E. VIRTANEN',
    'C. BLAKE', 'D. NOVAK', 'F. ALMEIDA', 'G. HARTMANN', 'I. SATO',
    'O. JANSSEN', 'V. PETROV', 'Y. MARCHAND', 'B. OKAFOR',
];

const DATA_DIR = __DIR__ . '/data';

// data/config.php (not in git) returns ['admin_hash' => …, 'salt' => …].
function config(): array
{
    $file = DATA_DIR . '/config.php';
    return is_file($file) ? (require $file) : [];
}

function db(): PDO
{
    $db = new PDO('sqlite:' . DATA_DIR . '/records.sqlite', null, null, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
    $db->exec('PRAGMA busy_timeout = 3000');
    $db->exec('CREATE TABLE IF NOT EXISTS players (uuid TEXT PRIMARY KEY, name TEXT NOT NULL, updated TEXT NOT NULL)');
    $db->exec('CREATE TABLE IF NOT EXISTS records (
        id INTEGER PRIMARY KEY,
        version INTEGER NOT NULL,
        kind TEXT NOT NULL,            -- lap | race | champ
        season TEXT NOT NULL,          -- empty for champ
        uuid TEXT NOT NULL,
        car TEXT NOT NULL,
        value REAL NOT NULL,           -- seconds, or points for champ
        created TEXT NOT NULL,
        UNIQUE (version, kind, season, uuid))');
    $db->exec('CREATE TABLE IF NOT EXISTS hits (ip TEXT NOT NULL, t INTEGER NOT NULL)');
    return $db;
}

// Lower is better for times, higher for championship points.
function better(string $kind): string
{
    return $kind === 'champ' ? 'DESC' : 'ASC';
}

// Every table the game shows: [kind, season] pairs.
function tables(): array
{
    $out = [];
    foreach (SEASONS as $s) {
        $out[] = ['lap', $s];
        $out[] = ['race', $s];
    }
    $out[] = ['champ', ''];
    return $out;
}

function top(PDO $db, string $kind, string $season, int $limit = TOP): array
{
    $q = $db->prepare('SELECT r.id, r.uuid, p.name, r.car, r.value, substr(r.created, 1, 10) AS date
        FROM records r JOIN players p ON p.uuid = r.uuid
        WHERE r.version = ? AND r.kind = ? AND r.season = ?
        ORDER BY r.value ' . better($kind) . ', r.created ASC LIMIT ' . $limit);
    $q->execute([RECORDS_VERSION, $kind, $season]);
    return $q->fetchAll();
}

// Upper-case, allowed characters only, single spaces, trimmed, clipped
// (the same rules as Profiles.clean in js/profiles.js).
function clean_name(string $name): string
{
    $up = strtoupper($name);
    $up = preg_replace("/[^A-Z0-9 .'\\-]/", '', $up);
    return substr(trim(preg_replace('/ +/', ' ', $up)), 0, NAME_MAX);
}

// Why an entry can't be recorded, or null when it can.
function entry_problem(array $e): ?string
{
    $kind = $e['kind'] ?? null;
    $season = $e['season'] ?? '';
    $car = $e['car'] ?? null;
    $value = $e['value'] ?? null;
    if (!in_array($car, CARS, true)) return 'unknown car';
    if (!is_int($value) && !is_float($value)) return 'bad value';
    if ($kind === 'champ') {
        if ($season !== '') return 'bad season';
        if ($value < 0 || $value > MAX_POINTS || floor($value) != $value) return 'impossible points';
        return null;
    }
    if (!in_array($kind, ['lap', 'race'], true)) return 'unknown kind';
    if (!in_array($season, SEASONS, true)) return 'unknown season';
    $min = $kind === 'lap' ? MIN_LAP[$season] : MIN_RACE[$season];
    if ($value < $min || $value > MAX_TIME) return 'impossible time';
    return null;
}

function json_out(int $status, array $body): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($body, JSON_UNESCAPED_UNICODE);
}
