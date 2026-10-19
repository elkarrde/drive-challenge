<?php
// ---------------------------------------------------------------------------
// Public records endpoint.
//   GET   → every table: {version, laps: {season: [...]}, races: {...}, champs: [...]}
//   POST  → {version, uuid, name, entries: [{kind, season, car, value}]}
//           records each entry that beats the player's own best and answers
//           {results: [{kind, season, rank, improved}]}; rank is the place in
//           the top 10, or null.
// ---------------------------------------------------------------------------
declare(strict_types=1);
require __DIR__ . '/lib.php';

try {
    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        $db = db();
        $out = ['version' => RECORDS_VERSION, 'laps' => [], 'races' => [], 'champs' => []];
        foreach (tables() as [$kind, $season]) {
            $rows = array_map(fn($r) => [
                'uuid' => $r['uuid'], 'name' => $r['name'], 'car' => $r['car'],
                'value' => (float)$r['value'], 'date' => $r['date'],
            ], top($db, $kind, $season));
            if ($kind === 'champ') $out['champs'] = $rows;
            else $out[$kind . 's'][$season] = $rows;
        }
        json_out(200, $out);
        exit;
    }
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        json_out(405, ['error' => 'method not allowed']);
        exit;
    }

    $raw = file_get_contents('php://input', false, null, 0, 4096);
    $in = json_decode((string)$raw, true);
    $uuid = is_array($in) ? ($in['uuid'] ?? '') : '';
    $name = clean_name(is_array($in) && is_string($in['name'] ?? null) ? $in['name'] : '');
    $entries = is_array($in) ? ($in['entries'] ?? null) : null;
    if (!is_string($uuid) || !preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/', $uuid)
        || $name === '' || in_array($name, AI_DRIVERS, true)
        || !is_array($entries) || count($entries) < 1 || count($entries) > 3) {
        json_out(400, ['error' => 'bad request']);
        exit;
    }
    if (($in['version'] ?? null) !== RECORDS_VERSION) {
        json_out(409, ['error' => 'old version, reload the game']);
        exit;
    }

    $db = db();
    $now = time();
    $ip = hash('sha256', (config()['salt'] ?? 'drive-challenge') . ($_SERVER['REMOTE_ADDR'] ?? ''));
    $db->prepare('DELETE FROM hits WHERE t < ?')->execute([$now - 3600]);
    $q = $db->prepare('SELECT COUNT(*) FROM hits WHERE ip = ?');
    $q->execute([$ip]);
    if ((int)$q->fetchColumn() >= RATE_LIMIT) {
        json_out(429, ['error' => 'too many submissions, try again later']);
        exit;
    }
    $db->prepare('INSERT INTO hits (ip, t) VALUES (?, ?)')->execute([$ip, $now]);

    $stamp = gmdate('Y-m-d H:i:s', $now);
    $db->beginTransaction();
    // The latest name wins, so a renamed player's records follow the new name.
    $db->prepare('INSERT INTO players (uuid, name, updated) VALUES (?, ?, ?)
        ON CONFLICT (uuid) DO UPDATE SET name = excluded.name, updated = excluded.updated')
        ->execute([$uuid, $name, $stamp]);

    $results = [];
    foreach ($entries as $e) {
        if (!is_array($e) || entry_problem($e) !== null) {
            $results[] = ['kind' => $e['kind'] ?? null, 'season' => $e['season'] ?? '', 'rank' => null, 'improved' => false, 'rejected' => true];
            continue;
        }
        $kind = $e['kind'];
        $season = $e['season'] ?? '';
        $cmp = $kind === 'champ' ? '>' : '<';
        $old = $db->prepare('SELECT value FROM records WHERE version = ? AND kind = ? AND season = ? AND uuid = ?');
        $old->execute([RECORDS_VERSION, $kind, $season, $uuid]);
        $prev = $old->fetchColumn();
        $improved = $prev === false || ($cmp === '<' ? $e['value'] < $prev : $e['value'] > $prev);
        if ($improved) {
            $db->prepare('INSERT INTO records (version, kind, season, uuid, car, value, created) VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (version, kind, season, uuid) DO UPDATE SET car = excluded.car, value = excluded.value, created = excluded.created')
                ->execute([RECORDS_VERSION, $kind, $season, $uuid, $e['car'], $e['value'], $stamp]);
        }
        $rank = null;
        foreach (top($db, $kind, $season) as $i => $row) {
            if ($row['uuid'] === $uuid) $rank = $i + 1;
        }
        $results[] = ['kind' => $kind, 'season' => $season, 'rank' => $rank, 'improved' => $improved];
    }
    $db->commit();
    json_out(200, ['results' => $results]);
} catch (Throwable $err) {
    error_log('drive-challenge records: ' . $err->getMessage());
    json_out(500, ['error' => 'records unavailable']);
}
