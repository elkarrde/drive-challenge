<?php
// ---------------------------------------------------------------------------
// Records admin: log in with the password whose hash is in data/config.php,
// then delete single entries or everything from one player.
// ---------------------------------------------------------------------------
declare(strict_types=1);
require __DIR__ . '/lib.php';

header('Cache-Control: no-store');
header('X-Frame-Options: DENY');
header("Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; form-action 'self'");

$hash = config()['admin_hash'] ?? '';
if ($hash === '') {
    http_response_code(503);
    exit('Admin is not configured (data/config.php).');
}

session_name('dcadmin');
session_set_cookie_params(['path' => dirname($_SERVER['SCRIPT_NAME']) . '/', 'secure' => true, 'httponly' => true, 'samesite' => 'Strict']);
session_start();
if (empty($_SESSION['csrf'])) $_SESSION['csrf'] = bin2hex(random_bytes(16));
$csrf = $_SESSION['csrf'];
$h = fn($s) => htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8');
$msg = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!hash_equals($csrf, (string)($_POST['csrf'] ?? ''))) {
        http_response_code(400);
        exit('Bad form token; reload the page.');
    }
    $action = $_POST['action'] ?? '';
    if ($action === 'login') {
        if (password_verify((string)($_POST['password'] ?? ''), $hash)) {
            session_regenerate_id(true);
            $_SESSION['admin'] = true;
        } else {
            sleep(2);
            $msg = 'Wrong password.';
        }
    } elseif ($action === 'logout') {
        $_SESSION = [];
        session_destroy();
        header('Location: admin.php');
        exit;
    } elseif (!empty($_SESSION['admin'])) {
        $db = db();
        if ($action === 'delete') {
            $db->prepare('DELETE FROM records WHERE id = ?')->execute([(int)($_POST['id'] ?? 0)]);
            $msg = 'Entry deleted.';
        } elseif ($action === 'delete_player') {
            $db->prepare('DELETE FROM records WHERE uuid = ?')->execute([(string)($_POST['uuid'] ?? '')]);
            $msg = 'All entries from that player deleted.';
        }
    }
}
?><!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <title>Drive Challenge records admin</title>
  <style>
    body { font: 14px/1.4 system-ui, sans-serif; margin: 16px; color: #1a1a1a; background: #fafafa; }
    table { border-collapse: collapse; margin: 4px 0 20px; }
    th, td { padding: 3px 10px; border-bottom: 1px solid #ddd; text-align: left; }
    td.num { text-align: right; font-variant-numeric: tabular-nums; }
    form.inline { display: inline; }
    button { cursor: pointer; }
    .msg { background: #fff3c4; padding: 6px 10px; display: inline-block; }
    code { font-size: 12px; color: #666; }
  </style>
</head>
<body>
<h1>Drive Challenge records</h1>
<?php if ($msg): ?><p class="msg"><?= $h($msg) ?></p><?php endif ?>
<?php if (empty($_SESSION['admin'])): ?>
  <form method="post">
    <input type="hidden" name="csrf" value="<?= $h($csrf) ?>">
    <input type="hidden" name="action" value="login">
    <label>Password <input type="password" name="password" autofocus autocomplete="current-password"></label>
    <button>Log in</button>
  </form>
<?php else: ?>
  <form method="post" class="inline">
    <input type="hidden" name="csrf" value="<?= $h($csrf) ?>">
    <button name="action" value="logout">Log out</button>
  </form>
  <p>Records version <?= RECORDS_VERSION ?>. Each table shows its best 50; the game shows the top <?= TOP ?>.</p>
  <?php $db = db(); foreach (tables() as [$kind, $season]): $rows = top($db, $kind, $season, 50); ?>
    <h2><?= $h($kind === 'champ' ? 'Championship totals' : ucfirst($season) . ' · ' . ($kind === 'lap' ? 'fastest laps' : 'race times')) ?></h2>
    <?php if (!$rows): ?><p>No entries.</p><?php continue; endif ?>
    <table>
      <tr><th>#</th><th>Name</th><th>Car</th><th><?= $kind === 'champ' ? 'Points' : 'Time (s)' ?></th><th>Date</th><th>Player</th><th></th></tr>
      <?php foreach ($rows as $i => $r): ?>
        <tr>
          <td class="num"><?= $i + 1 ?></td>
          <td><?= $h($r['name']) ?></td>
          <td><?= $h($r['car']) ?></td>
          <td class="num"><?= $h($kind === 'champ' ? (int)$r['value'] : number_format((float)$r['value'], 2)) ?></td>
          <td><?= $h($r['date']) ?></td>
          <td><code><?= $h(substr($r['uuid'], 0, 8)) ?></code></td>
          <td>
            <form method="post" class="inline">
              <input type="hidden" name="csrf" value="<?= $h($csrf) ?>">
              <input type="hidden" name="id" value="<?= (int)$r['id'] ?>">
              <button name="action" value="delete">Delete</button>
            </form>
            <form method="post" class="inline">
              <input type="hidden" name="csrf" value="<?= $h($csrf) ?>">
              <input type="hidden" name="uuid" value="<?= $h($r['uuid']) ?>">
              <button name="action" value="delete_player">Delete all from player</button>
            </form>
          </td>
        </tr>
      <?php endforeach ?>
    </table>
  <?php endforeach ?>
<?php endif ?>
</body>
</html>
