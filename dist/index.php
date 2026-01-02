<?php
/**
 * BECMI Fantasy Simulator - Event Viewer
 * 
 * Configure the path below to match your server setup
 */

// =======================================================
// CONFIGURE THESE PATHS TO MATCH YOUR SERVER
// =======================================================
$basePath = '/home/mbutler/fantasy-log';  // Path to your simulation folder
// =======================================================

$eventsPath = $basePath . '/logs/events.jsonl';
$worldPath = $basePath . '/world.json';

// How many events to show
$limit = isset($_GET['limit']) ? min(100, max(10, (int)$_GET['limit'])) : 50;

// Category colors
$categoryColors = [
    'road' => '#4ade80',      // green
    'town' => '#60a5fa',      // blue
    'dungeon' => '#f472b6',   // pink
    'faction' => '#c084fc',   // purple
    'system' => '#94a3b8',    // gray
    'war' => '#ef4444',       // red
    'trade' => '#fbbf24',     // amber
    'naval' => '#22d3ee',     // cyan
    'ecology' => '#a3e635',   // lime
    'character' => '#fb923c', // orange
];

// Load events
$events = [];
$error = null;

if (!file_exists($eventsPath)) {
    $error = "Events file not found: $eventsPath";
} else {
    $lines = file($eventsPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    if ($lines === false) {
        $error = "Cannot read events file";
    } else {
        $lines = array_slice($lines, -$limit);
        $lines = array_reverse($lines); // Newest first
        foreach ($lines as $line) {
            $decoded = json_decode($line, true);
            if ($decoded) {
                $events[] = $decoded;
            }
        }
    }
}

// Load world info
$world = null;
if (file_exists($worldPath)) {
    $worldData = file_get_contents($worldPath);
    if ($worldData) {
        $world = json_decode($worldData, true);
    }
}

// Deep context lookups - NPC backstory and relationships
function getNPCByName($world, $name) {
    if (!$world || empty($world['npcs'])) return null;
    foreach ($world['npcs'] as $npc) {
        if ($npc['name'] === $name) return $npc;
    }
    return null;
}

function getNPCDeepContext($world, $name) {
    $npc = getNPCByName($world, $name);
    if (!$npc) return null;
    
    $lines = [];
    $depth = $npc['depth'] ?? [];
    
    // Background and motivation
    if (!empty($depth['background'])) {
        $bg = str_replace('-', ' ', $depth['background']);
        $lines[] = ucfirst($bg);
    }
    if (!empty($depth['motivation'])) {
        $lines[] = "Driven by: " . $depth['motivation'];
    }
    if (!empty($depth['secretMotivation'])) {
        $lines[] = "Secret desire: " . $depth['secretMotivation'];
    }
    
    // Traits
    if (!empty($depth['traits'])) {
        $lines[] = "Traits: " . implode(', ', $depth['traits']);
    }
    
    // Quirks
    if (!empty($depth['quirks'])) {
        $lines[] = "Quirk: " . $depth['quirks'][0];
    }
    
    // Relationships - the juicy stuff!
    if (!empty($depth['relationships'])) {
        foreach ($depth['relationships'] as $rel) {
            $type = $rel['type'] ?? 'knows';
            $target = $rel['targetName'] ?? 'someone';
            $history = $rel['history'] ?? '';
            if ($history) {
                $lines[] = "$type $target: \"$history\"";
            }
        }
    }
    
    // Secrets known
    if (!empty($npc['secretsKnown'])) {
        $lines[] = "Knows secrets...";
    }
    
    // Marriage
    if (!empty($npc['spouseId'])) {
        $spouse = getNPCById($world, $npc['spouseId']);
        if ($spouse) {
            $lines[] = "Married to " . $spouse['name'];
        }
    }
    
    return $lines ? implode("\n", $lines) : null;
}

function getNPCById($world, $id) {
    if (!$world || empty($world['npcs'])) return null;
    foreach ($world['npcs'] as $npc) {
        if ($npc['id'] === $id) return $npc;
    }
    return null;
}

// Find active story threads involving this actor or location
function getActiveStories($world, $actors, $location) {
    if (!$world || empty($world['storyThreads'])) return [];
    $stories = [];
    foreach ($world['storyThreads'] as $story) {
        if ($story['resolved'] ?? false) continue;
        
        $match = false;
        if ($location && ($story['location'] ?? '') === $location) $match = true;
        if (!empty($actors) && !empty($story['actors'])) {
            foreach ($actors as $actor) {
                if (in_array($actor, $story['actors'])) $match = true;
            }
        }
        
        if ($match) {
            $title = $story['title'] ?? 'Unknown tale';
            $phase = $story['phase'] ?? 'unfolding';
            $tension = $story['tension'] ?? 0;
            $outcomes = $story['potentialOutcomes'] ?? [];
            $outcome = !empty($outcomes) ? $outcomes[0] : '';
            
            $storyLine = "\"$title\" ($phase, tension $tension)";
            if ($outcome) $storyLine .= "\nPossible end: $outcome";
            $stories[] = $storyLine;
        }
    }
    return $stories;
}

// Find relationships between actors in this event
function getRelationshipsBetween($world, $actors) {
    if (!$world || count($actors) < 2) return [];
    $rels = [];
    
    foreach ($actors as $actorName) {
        $npc = getNPCByName($world, $actorName);
        if (!$npc || empty($npc['depth']['relationships'])) continue;
        
        foreach ($npc['depth']['relationships'] as $rel) {
            $targetName = $rel['targetName'] ?? '';
            if (in_array($targetName, $actors)) {
                $type = $rel['type'] ?? 'knows';
                $history = $rel['history'] ?? '';
                if ($history) {
                    $rels[] = "$actorName → $targetName ($type): \"$history\"";
                }
            }
        }
    }
    return $rels;
}

// Format timestamp
function formatTime($iso) {
    $dt = new DateTime($iso);
    return $dt->format('M j, H:i');
}

function formatWorldDate($iso) {
    $dt = new DateTime($iso);
    // Fantasy calendar approximation
    $dayOfYear = (int)$dt->format('z') + 1;
    $month = floor($dayOfYear / 30) + 1;
    $day = ($dayOfYear % 30) ?: 30;
    $months = ['', 'Deepwinter', 'Icemelt', 'Mudmonth', 'Rainmoon', 'Greengrass', 
               'Highsun', 'Summertide', 'Harvestmoon', 'Leaffall', 'Rotting', 
               'Darkening', 'Yearsend'];
    $monthName = $months[min($month, 12)] ?? 'Unknown';
    return "$day $monthName, " . $dt->format('H:i');
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="refresh" content="60">
    <title>World Without Players</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        
        body {
            font-family: 'JetBrains Mono', 'Fira Code', 'SF Mono', monospace;
            background: #0f0f14;
            color: #e2e2e8;
            min-height: 100vh;
            font-size: 13px;
            line-height: 1.5;
        }
        
        .container {
            max-width: 900px;
            margin: 0 auto;
            padding: 20px;
        }
        
        header {
            border-bottom: 1px solid #2a2a35;
            padding-bottom: 16px;
            margin-bottom: 20px;
        }
        
        h1 {
            font-size: 16px;
            font-weight: 600;
            color: #c084fc;
            letter-spacing: 0.5px;
            margin-bottom: 2px;
        }
        
        h2 {
            font-size: 11px;
            font-weight: 400;
            color: #6b6b7a;
            letter-spacing: 0.3px;
            margin-top: 0;
        }
        
        .meta {
            display: flex;
            gap: 24px;
            margin-top: 8px;
            font-size: 11px;
            color: #6b6b7a;
        }
        
        .meta span { display: flex; align-items: center; gap: 4px; }
        .meta .dot { color: #4ade80; }
        
        .error {
            background: #2d1f1f;
            border: 1px solid #5c2727;
            color: #f87171;
            padding: 12px 16px;
            border-radius: 6px;
            margin-bottom: 20px;
        }
        
        .events {
            display: flex;
            flex-direction: column;
            gap: 2px;
        }
        
        .event {
            display: grid;
            grid-template-columns: 130px 65px 1fr;
            gap: 16px;
            padding: 8px 12px;
            background: #16161d;
            border-radius: 4px;
            align-items: start;
        }
        
        .event:hover {
            background: #1e1e28;
        }
        
        .time {
            color: #6b6b7a;
            font-size: 11px;
            white-space: nowrap;
            min-width: 130px;
        }
        
        .category {
            font-size: 10px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            padding: 2px 6px;
            border-radius: 3px;
            background: #2a2a35;
            text-align: center;
            min-width: 65px;
            max-width: 65px;
        }
        
        .content {
            display: flex;
            flex-direction: column;
            gap: 2px;
        }
        
        .summary {
            color: #e2e2e8;
        }
        
        .location {
            color: #fbbf24;
        }
        
        .details {
            color: #6b6b7a;
            font-size: 12px;
        }
        
        .actors {
            color: #60a5fa;
            font-size: 11px;
        }
        
        footer {
            margin-top: 24px;
            padding-top: 16px;
            border-top: 1px solid #2a2a35;
            font-size: 11px;
            color: #6b6b7a;
            display: flex;
            justify-content: space-between;
        }
        
        a { color: #c084fc; text-decoration: none; }
        a:hover { text-decoration: underline; }
        
        /* Custom styled tooltip */
        .has-tooltip {
            position: relative;
            cursor: help;
        }
        
        .custom-tooltip {
            position: fixed;
            z-index: 1000;
            max-width: 400px;
            padding: 12px 16px;
            background: #1a1a24;
            border: 1px solid #3a3a4a;
            border-radius: 6px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.5);
            font-size: 11px;
            line-height: 1.5;
            color: #b8b8c8;
            white-space: pre-wrap;
            pointer-events: none;
            opacity: 0;
            transition: opacity 0.15s ease;
        }
        
        .custom-tooltip.visible {
            opacity: 1;
        }
        
        .custom-tooltip .tt-header {
            color: #c084fc;
            font-weight: 600;
            font-size: 10px;
            letter-spacing: 0.5px;
            margin-bottom: 6px;
            border-bottom: 1px solid #2a2a35;
            padding-bottom: 4px;
        }
        
        .custom-tooltip .tt-section {
            margin-bottom: 8px;
        }
        
        .custom-tooltip .tt-section:last-child {
            margin-bottom: 0;
        }
        
        .custom-tooltip .tt-label {
            color: #6b8aaf;
            font-size: 9px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        
        .custom-tooltip .tt-quote {
            color: #a8a878;
            font-style: italic;
        }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1>⚔ WORLD WITHOUT PLAYERS</h1>
            <h2>A BECMI event log</h2>
            <div class="meta">
                <?php if ($world): ?>
                <span><span class="dot">●</span> <?= htmlspecialchars($world['archetype'] ?? 'Unknown') ?></span>
                <span><?= count($world['settlements'] ?? []) ?> settlements</span>
                <span><?= count($world['parties'] ?? []) ?> parties</span>
                <span>Seed: <?= htmlspecialchars($world['seed'] ?? '?') ?></span>
                <?php endif; ?>
            </div>
        </header>
        
        <?php if ($error): ?>
        <div class="error"><?= htmlspecialchars($error) ?></div>
        <?php endif; ?>
        
        <div class="events">
            <?php foreach ($events as $e): 
                $cat = $e['category'] ?? 'system';
                $color = $categoryColors[$cat] ?? '#94a3b8';
            ?>
            <div class="event">
                <div class="time" title="<?= htmlspecialchars($e['worldTime'] ?? '') ?>"><?= formatWorldDate($e['worldTime'] ?? '') ?></div>
                <div class="category" style="color: <?= $color ?>"><?= htmlspecialchars($cat) ?></div>
                <div class="content">
                    <?php
                    // Build contextual tooltip with DEEP backstory from world.json
                    $tooltipParts = [];
                    $actors = $e['actors'] ?? [];
                    $location = $e['location'] ?? '';
                    
                    // 1. RELATIONSHIPS BETWEEN ACTORS IN THIS EVENT
                    $relationships = getRelationshipsBetween($world, $actors);
                    if ($relationships) {
                        $tooltipParts[] = "═══ HISTORY ═══\n" . implode("\n", $relationships);
                    }
                    
                    // 2. ACTIVE STORY THREADS involving these actors/location
                    $stories = getActiveStories($world, $actors, $location);
                    if ($stories) {
                        $tooltipParts[] = "═══ ACTIVE PLOTS ═══\n" . implode("\n\n", $stories);
                    }
                    
                    // 3. NPC BACKSTORIES for actors (limit to first 2 to avoid huge tooltip)
                    $npcCount = 0;
                    foreach ($actors as $actor) {
                        if ($npcCount >= 2) break;
                        $npcCtx = getNPCDeepContext($world, $actor);
                        if ($npcCtx) {
                            $tooltipParts[] = "═══ $actor ═══\n$npcCtx";
                            $npcCount++;
                        }
                    }
                    
                    $tooltip = implode("\n\n", $tooltipParts);
                    ?>
                    <div class="summary<?= $tooltip ? ' has-tooltip' : '' ?>"<?= $tooltip ? ' data-tooltip="' . htmlspecialchars($tooltip) . '"' : '' ?>>
                        <?php if (!empty($e['location'])): ?>
                        <span class="location"><?= htmlspecialchars($e['location']) ?>:</span>
                        <?php endif; ?>
                        <?= htmlspecialchars($e['summary'] ?? '') ?>
                    </div>
                    <?php if (!empty($e['details'])): ?>
                    <div class="details"><?= htmlspecialchars($e['details']) ?></div>
                    <?php endif; ?>
                    <?php if (!empty($e['actors'])): ?>
                    <div class="actors"><?= htmlspecialchars(implode(', ', $e['actors'])) ?></div>
                    <?php endif; ?>
                </div>
            </div>
            <?php endforeach; ?>
            
            <?php if (empty($events) && !$error): ?>
            <div class="event">
                <div class="time">—</div>
                <div class="category">system</div>
                <div class="content">
                    <div class="summary">No events yet. Start the simulation!</div>
                </div>
            </div>
            <?php endif; ?>
        </div>
        
        <footer>
            <span>Showing <?= count($events) ?> events (newest first) · Auto-refresh: 60s</span>
            <span>
                <a href="?limit=20">20</a> · 
                <a href="?limit=50">50</a> · 
                <a href="?limit=100">100</a>
            </span>
        </footer>
    </div>
    
    <!-- Custom tooltip container -->
    <div id="tooltip" class="custom-tooltip"></div>
    
    <script>
    (function() {
        const tooltip = document.getElementById('tooltip');
        let showTimeout;
        
        // Helper to escape HTML for safe display
        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }
        
        // Format tooltip with styled sections
        function formatTooltip(raw) {
            // Split into lines and process each
            const lines = raw.split('\n');
            let html = '';
            
            for (const line of lines) {
                // Section headers
                const headerMatch = line.match(/^═══ (.+) ═══$/);
                if (headerMatch) {
                    html += '<div class="tt-label">' + escapeHtml(headerMatch[1]) + '</div>';
                    continue;
                }
                
                // Lines with quotes - style the quoted part
                let processedLine = escapeHtml(line);
                processedLine = processedLine.replace(/&quot;([^&]+)&quot;/g, '<span class="tt-quote">"$1"</span>');
                processedLine = processedLine.replace(/"([^"]+)"/g, '<span class="tt-quote">"$1"</span>');
                
                if (line.trim()) {
                    html += '<div>' + processedLine + '</div>';
                }
            }
            
            return html;
        }
        
        document.querySelectorAll('.has-tooltip').forEach(el => {
            el.addEventListener('mouseenter', function(e) {
                const text = this.getAttribute('data-tooltip');
                if (!text) return;
                
                clearTimeout(showTimeout);
                showTimeout = setTimeout(() => {
                    tooltip.innerHTML = formatTooltip(text);
                    
                    // Position near cursor
                    let x = e.clientX + 15;
                    let y = e.clientY + 15;
                    
                    tooltip.style.left = x + 'px';
                    tooltip.style.top = y + 'px';
                    tooltip.classList.add('visible');
                    
                    // Adjust if off-screen
                    const ttRect = tooltip.getBoundingClientRect();
                    if (ttRect.right > window.innerWidth - 20) {
                        tooltip.style.left = (window.innerWidth - ttRect.width - 20) + 'px';
                    }
                    if (ttRect.bottom > window.innerHeight - 20) {
                        tooltip.style.top = (y - ttRect.height - 30) + 'px';
                    }
                }, 300);
            });
            
            el.addEventListener('mouseleave', function() {
                clearTimeout(showTimeout);
                tooltip.classList.remove('visible');
            });
            
            el.addEventListener('mousemove', function(e) {
                if (tooltip.classList.contains('visible')) {
                    tooltip.style.left = (e.clientX + 15) + 'px';
                    tooltip.style.top = (e.clientY + 15) + 'px';
                }
            });
        });
    })();
    </script>
</body>
</html>
