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

// Handle export requests
if (isset($_GET['export'])) {
    $exportType = $_GET['export'];
    
    if ($exportType === 'world' && file_exists($worldPath)) {
        header('Content-Type: application/json');
        header('Content-Disposition: attachment; filename="world.json"');
        header('Content-Length: ' . filesize($worldPath));
        readfile($worldPath);
        exit;
    } elseif ($exportType === 'events' && file_exists($eventsPath)) {
        header('Content-Type: application/x-ndjson');
        header('Content-Disposition: attachment; filename="events.jsonl"');
        header('Content-Length: ' . filesize($eventsPath));
        readfile($eventsPath);
        exit;
    } else {
        http_response_code(404);
        echo 'File not found';
        exit;
    }
}

// Pagination settings
$limit = isset($_GET['limit']) ? min(500, max(10, (int)$_GET['limit'])) : 50;
$page = isset($_GET['page']) ? max(1, (int)$_GET['page']) : 1;
$order = isset($_GET['order']) && $_GET['order'] === 'oldest' ? 'oldest' : 'newest'; // 'newest' or 'oldest'

// Entity filter - search by name in actors, location, summary, details
$entityFilter = isset($_GET['entity']) ? trim($_GET['entity']) : '';

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

// Load events with pagination
$events = [];
$error = null;
$totalEvents = 0;
$totalPages = 1;

if (!file_exists($eventsPath)) {
    $error = "Events file not found: $eventsPath";
} else {
    $lines = file($eventsPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    if ($lines === false) {
        $error = "Cannot read events file";
    } else {
        // Parse all events first (for deduplication and counting)
        $allEvents = [];
        $seenIds = [];
        foreach ($lines as $line) {
            $decoded = json_decode($line, true);
            if ($decoded) {
                // Deduplicate by event ID if present, otherwise by timestamp + summary
                $eventId = $decoded['id'] ?? null;
                if ($eventId) {
                    if (isset($seenIds[$eventId])) continue;
                    $seenIds[$eventId] = true;
                } else {
                    // Fallback: dedupe by timestamp + summary
                    $key = ($decoded['timestamp'] ?? '') . '|' . ($decoded['summary'] ?? '');
                    if (isset($seenIds[$key])) continue;
                    $seenIds[$key] = true;
                }
                $allEvents[] = $decoded;
            }
        }
        
        // Sort by worldTime (newest first by default, or oldest first if requested)
        usort($allEvents, function($a, $b) use ($order) {
            $timeA = $a['worldTime'] ?? '';
            $timeB = $b['worldTime'] ?? '';
            // If worldTime is missing, use realTime as fallback
            if (empty($timeA)) $timeA = $a['realTime'] ?? '';
            if (empty($timeB)) $timeB = $b['realTime'] ?? '';
            // Compare as timestamps
            if ($order === 'oldest') {
                return strcmp($timeA, $timeB); // Ascending = oldest first
            } else {
                return strcmp($timeB, $timeA); // Descending = newest first
            }
        });
        
        // Apply entity filter if specified
        if ($entityFilter !== '') {
            $filterLower = strtolower($entityFilter);
            $allEvents = array_filter($allEvents, function($event) use ($filterLower) {
                // Check actors array
                $actors = $event['actors'] ?? [];
                foreach ($actors as $actor) {
                    if (stripos($actor, $filterLower) !== false) return true;
                }
                // Check location
                if (stripos($event['location'] ?? '', $filterLower) !== false) return true;
                // Check summary
                if (stripos($event['summary'] ?? '', $filterLower) !== false) return true;
                // Check details
                if (stripos($event['details'] ?? '', $filterLower) !== false) return true;
                return false;
            });
            $allEvents = array_values($allEvents); // Re-index
        }
        
        $totalEvents = count($allEvents);
        $totalPages = max(1, ceil($totalEvents / $limit));
        
        // Ensure page is within valid range
        $page = min($page, $totalPages);
        
        // Calculate pagination offset
        $offset = ($page - 1) * $limit;
        $events = array_slice($allEvents, $offset, $limit);
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

// Check simulation health - is it still running?
$simStatus = 'unknown';
$simLastUpdate = null;
$simStaleMinutes = 0;

// Check systemd service status (most reliable)
$systemctlOutput = trim(shell_exec('systemctl is-active fantasy-log 2>/dev/null') ?? '');

if ($systemctlOutput === 'active') {
    // Systemd service is running
    $simStatus = 'running';
    $simLastUpdate = date('c');
    $simStaleMinutes = 0;
} elseif ($systemctlOutput === 'inactive' || $systemctlOutput === 'failed') {
    // Service explicitly stopped or failed
    $simStatus = 'stopped';
} else {
    // Fallback: check for process directly (for non-systemd setups)
    $psOutput = shell_exec('ps aux | grep "fantasy-log" | grep -v grep');
    if ($psOutput && strpos($psOutput, 'fantasy-log') !== false) {
        $simStatus = 'running';
        $simLastUpdate = date('c');
        $simStaleMinutes = 0;
    }
}

// Fallback: Event log timestamps
if ($simStatus === 'unknown') {
    if (!empty($events)) {
        // Get the most recent event's real time (when it was actually logged)
        $lastEvent = $events[0]; // Already sorted newest first
        $lastRealTime = $lastEvent['realTime'] ?? null;

        if ($lastRealTime) {
            $lastTimestamp = strtotime($lastRealTime);
            $now = time();
            $simStaleMinutes = floor(($now - $lastTimestamp) / 60);
            $simLastUpdate = $lastRealTime;

            // At 1:1 real-time, hourly tick fires every 60 real minutes
            // Daily tick fires every 24 real hours - that ALWAYS logs events
            // Use generous thresholds to avoid false alarms
            if ($simStaleMinutes < 90) {
                $simStatus = 'running';  // Within ~1.5 hours - probably fine
            } elseif ($simStaleMinutes < 360) {
                $simStatus = 'stale';    // 1.5-6 hours - might be slow or paused
            } else {
                $simStatus = 'stopped';  // 6+ hours - definitely crashed or stopped
            }
        }
    }
}

// Also check world.json modification time as backup
$worldModTime = file_exists($worldPath) ? filemtime($worldPath) : 0;
$worldStaleMinutes = $worldModTime ? floor((time() - $worldModTime) / 60) : 999;

// Deep context lookups - NPC backstory and relationships
function getNPCByName($world, $name) {
    if (!$world || empty($world['npcs'])) return null;
    foreach ($world['npcs'] as $npc) {
        if ($npc['name'] === $name) return $npc;
    }
    return null;
}

// NEW GLIMPSE FUNCTIONS - Hints of deep simulation without spoilers

function getStoryGlimpse($world, $actors, $location) {
    if (!$world || empty($world['storyThreads'])) return '';

    $activeStories = array_filter($world['storyThreads'], function($s) {
        return !($s['resolved'] ?? false);
    });
    if (empty($activeStories)) return '';

    // Find stories relevant to this event
    $relevantStories = [];
    foreach ($activeStories as $story) {
        $matches = false;
        if ($location && ($story['location'] ?? '') === $location) $matches = true;
        if (!empty($actors) && !empty($story['actors'])) {
            if (!empty(array_intersect($actors, $story['actors']))) $matches = true;
        }
        if ($matches) {
            $relevantStories[] = $story;
        }
    }

    // If no relevant stories, use top global story as fallback (show glimpses more often)
    $storiesToUse = $relevantStories;
    if (empty($storiesToUse)) {
        usort($activeStories, function($a, $b) {
            return ($b['tension'] ?? 0) <=> ($a['tension'] ?? 0);
        });
        $topStory = $activeStories[0] ?? null;
        if ($topStory && ($topStory['tension'] ?? 0) >= 2) {
            $storiesToUse = [$topStory];
        }
    }
    
    if (empty($storiesToUse)) return '';

    // Sort by tension, show most interesting
    usort($storiesToUse, function($a, $b) {
        return ($b['tension'] ?? 0) <=> ($a['tension'] ?? 0);
    });
    
    $story = $storiesToUse[0];
    $type = $story['type'] ?? 'story';
    $phase = $story['phase'] ?? 'unfolding';
    $tension = $story['tension'] ?? 0;
    $context = $story['context'] ?? [];
    $title = $story['title'] ?? null;
    $location = $story['location'] ?? null;
    $actors = $story['actors'] ?? [];
    
    $typeName = ucfirst($type);
    
    // Extract rich context data
    $motivations = $context['motivations'] ?? [];
    $themes = $context['themes'] ?? [];
    $actorRelationships = $context['actorRelationships'] ?? [];
    
    // Build detailed glimpse showing the simulation depth
    $parts = [];
    
    // Phase/tension state
    if ($phase === 'climax' && $tension >= 8) {
        $parts[] = "reaches its breaking point";
    } elseif ($phase === 'climax') {
        $parts[] = "approaches its climax";
    } elseif ($phase === 'rising' && $tension >= 7) {
        $parts[] = "builds toward confrontation";
    } elseif ($tension >= 7) {
        $parts[] = "high-stakes escalation";
    } elseif ($phase === 'rising' && $tension >= 4) {
        $parts[] = "gains momentum";
    } elseif ($phase === 'inciting' && $tension >= 3) {
        $parts[] = "begins to unfold";
    } elseif ($phase === 'inciting') {
        $parts[] = "begins";
    } elseif ($tension >= 2) {
        $parts[] = "develops";
    }
    
    // Add motivations - show what's driving this (always add if available, not just when parts < 3)
    if (!empty($motivations)) {
        $motParts = [];
        $count = 0;
        foreach ($motivations as $actor => $motivation) {
            if ($count >= 2) break;
            if (is_string($motivation) && strlen($motivation) < 50) {
                // Remove "motivated by" prefix if present to avoid redundancy
                $cleanMot = preg_replace('/^motivated by\s+/i', '', $motivation);
                $motParts[] = strtolower($cleanMot);
                $count++;
            }
        }
        if (!empty($motParts)) {
            $parts[] = "driven by " . implode(" and ", $motParts);
        }
    }
    
    // Add themes (add early - themes are important context)
    if (!empty($themes) && count($parts) < 4) {
        $themeStr = implode(", ", array_slice($themes, 0, 2));
        if (strlen($themeStr) < 40) {
            $parts[] = "themes: " . strtolower($themeStr);
        }
    }
    
    // Add relationship context - show the connections
    if (!empty($actorRelationships) && count($parts) < 4) {
        $rel = $actorRelationships[0];
        // Extract relationship type and history
        if (preg_match('/\((\w+)\):\s*"([^"]+)"/', $rel, $matches)) {
            $relType = $matches[1];
            $history = $matches[2];
            if (strlen($history) < 45) {
                $parts[] = "$relType: " . strtolower($history);
            } else {
                $parts[] = "$relType involved";
            }
        } elseif (preg_match('/\((\w+)\):/', $rel, $matches)) {
            $parts[] = $matches[1] . "s involved";
        }
    }
    
    // If we only have phase/tension info but no context, add story metadata
    // Check if parts only contain generic phase descriptions (not motivations/themes/relationships)
    $hasContext = !empty($motivations) || !empty($themes) || !empty($actorRelationships);
    
    // Combine into rich glimpse - use more natural formatting
    if (count($parts) > 0) {
        $baseText = "";
        
        // If we have a title, use it as the main descriptor instead of generic type
        if ($title && strlen($title) < 50 && !$hasContext) {
            $baseText = '"' . $title . '"';
        } else {
            $baseText = "A $typeName";
            if (count($parts) > 0) {
                $baseText .= " " . $parts[0];
            }
        }
        
        // Add additional context parts more naturally
        $additionalParts = [];
        
        // If we used title, add location/actors as context
        if ($title && strlen($title) < 50 && !$hasContext) {
            if ($location) {
                $additionalParts[] = "near " . $location;
            }
            if (!empty($actors) && count($actors) > 0 && count($additionalParts) < 2) {
                $actorCount = count($actors);
                if ($actorCount <= 2) {
                    $additionalParts[] = "involves " . implode(" and ", array_slice($actors, 0, 2));
                } elseif ($actorCount <= 3) {
                    $additionalParts[] = "involves " . implode(", ", array_slice($actors, 0, 3));
                } else {
                    $additionalParts[] = "involves " . $actorCount . " characters";
                }
            }
            // Skip the first part (phase description) since we used title instead
            if (count($parts) > 1) {
                $additionalParts = array_merge($additionalParts, array_slice($parts, 1));
            }
        } else {
            // Use remaining parts
            if (count($parts) > 1) {
                $additionalParts = array_slice($parts, 1);
            }
            // Add location/actors if no context
            if (!$hasContext) {
                if ($location && count($additionalParts) < 3) {
                    $additionalParts[] = "near " . $location;
                }
                if (!empty($actors) && count($actors) > 0 && count($additionalParts) < 3) {
                    $actorCount = count($actors);
                    if ($actorCount <= 2) {
                        $additionalParts[] = "involves " . implode(" and ", array_slice($actors, 0, 2));
                    } elseif ($actorCount <= 3) {
                        $additionalParts[] = "involves " . implode(", ", array_slice($actors, 0, 3));
                    }
                }
            }
        }
        
        // Combine with more natural connectors
        if (!empty($additionalParts)) {
            if (count($additionalParts) === 1) {
                return $baseText . " · " . $additionalParts[0];
            } elseif (count($additionalParts) === 2) {
                // For two items, use comma
                return $baseText . " · " . implode(", ", $additionalParts);
            } else {
                // For three or more, use "and" for the last two, commas for earlier ones
                $last = array_pop($additionalParts);
                return $baseText . " · " . implode(", ", $additionalParts) . " and " . $last;
            }
        }
        
        return $baseText;
    }
    
    // Fallback: use story metadata when context is completely empty
    $fallbackParts = [];
    
    // Add story title if available (more descriptive than type)
    if ($title && strlen($title) < 50) {
        $fallbackParts[] = '"' . $title . '"';
    }
    
    // Add location context
    if ($location) {
        $fallbackParts[] = "near " . $location;
    }
    
    // Add actor count context
    if (!empty($actors) && count($actors) > 0) {
        $actorCount = count($actors);
        if ($actorCount <= 3) {
            $fallbackParts[] = "involves " . implode(", ", array_slice($actors, 0, 3));
        } else {
            $fallbackParts[] = "involves " . $actorCount . " characters";
        }
    }
    
    // Add tension/phase context even if basic
    if ($tension >= 7) {
        $fallbackParts[] = "high tension";
    } elseif ($phase === 'climax') {
        $fallbackParts[] = "approaching climax";
    } elseif ($phase === 'rising') {
        $fallbackParts[] = "building";
    }
    
    if (!empty($fallbackParts)) {
        return "A $typeName " . implode("; ", $fallbackParts);
    }
    
    // Fallback with intersection
    if (count($storiesToUse) >= 2) {
        $types = array_unique(array_map(function($s) {
            return $s['type'] ?? 'story';
        }, array_slice($storiesToUse, 0, 2)));
        if (count($types) >= 2) {
            $typeNames = array_map('ucfirst', $types);
            return implode(' and ', $typeNames) . ' converge';
        }
    }
    
    // Last resort: at least mention the type
    return "A $typeName unfolds";
}

function getMotivationGlimpse($world, $actors) {
    if (empty($actors)) return '';
    if (count($actors) < 2) return '';

    // Get actual relationships between actors
    $relationships = getRelationshipsBetween($world, $actors);

    // Check for secret motivations
    $hasSecret = false;
    $secretMotivation = null;
    foreach ($actors as $actor) {
        $npc = getNPCByName($world, $actor);
        if ($npc && !empty($npc['depth']['secretMotivation'])) {
            $hasSecret = true;
            $secretMotivation = $npc['depth']['secretMotivation'];
            break; // Just need one secret
        }
    }
    
    // Get backgrounds and motivations
    $backgrounds = [];
    $motivations = [];
    foreach ($actors as $actor) {
        $npc = getNPCByName($world, $actor);
        if ($npc) {
            $depth = $npc['depth'] ?? [];
            if (!empty($depth['background'])) {
                $bg = str_replace('-', ' ', $depth['background']);
                $backgrounds[] = $bg;
            }
            if (!empty($depth['motivation'])) {
                $motivations[] = $depth['motivation'];
            }
        }
    }
    
    // Build rich glimpse with multiple details
    $parts = [];
    
    if ($hasSecret && $secretMotivation) {
        $parts[] = "hidden agenda: " . strtolower($secretMotivation);
    }
    
    if (empty($relationships)) {
        // Show backgrounds/motivations even without relationships
        if (!empty($backgrounds)) {
            $parts[] = str_replace('-', ' ', $backgrounds[0]) . " background";
        }
        if (!empty($motivations) && count($parts) < 2) {
            $parts[] = "driven by " . strtolower($motivations[0]);
        }
        if (!empty($parts)) {
            return ucfirst(implode("; ", $parts));
        }
        return '';
    }

    // Extract relationship types and history
    $relTypes = [];
    $relHistories = [];
    foreach ($relationships as $rel) {
        if (preg_match('/\((\w+)\):\s*"([^"]+)"/', $rel, $matches)) {
            $relTypes[] = $matches[1];
            $relHistories[] = $matches[2];
        } elseif (preg_match('/\((\w+)\):/', $rel, $matches)) {
            $relTypes[] = $matches[1];
        }
    }
    
    // Get loyalties
    $loyalties = [];
    foreach ($actors as $actor) {
        $npc = getNPCByName($world, $actor);
        if ($npc && !empty($npc['loyalty'])) {
            $loyalties[] = $npc['loyalty'];
        }
    }
    $uniqueLoyalties = array_unique($loyalties);

    // Build relationship glimpse with context
    $enemyTypes = array_intersect($relTypes, ['enemy', 'rival', 'betrayer', 'betrayed']);
    $friendlyTypes = array_intersect($relTypes, ['ally', 'lover', 'mentor', 'student', 'kin']);
    $conflictTypes = array_intersect($relTypes, ['debtor', 'creditor']);
    
    // Add relationship history
    $historyText = '';
    if (!empty($relHistories)) {
        $history = $relHistories[0];
        if (strlen($history) < 50) {
            $historyText = ": " . strtolower($history);
        }
    }
    
    if (!empty($enemyTypes) && !empty($friendlyTypes)) {
        $parts[] = "old enemies and allies forced together" . $historyText;
    } elseif (!empty($enemyTypes)) {
        $enemyType = $enemyTypes[0];
        $typeName = $enemyType === 'rival' ? 'rivals' : ($enemyType === 'betrayer' || $enemyType === 'betrayed' ? 'former friends' : 'enemies');
        $parts[] = "old $typeName cross paths" . $historyText;
    } elseif (in_array('betrayer', $relTypes) || in_array('betrayed', $relTypes)) {
        $parts[] = "betrayed friendship haunts this" . $historyText;
    } elseif (!empty($friendlyTypes)) {
        if (count($uniqueLoyalties) > 1) {
            $parts[] = "allies divided by conflicting loyalties";
        } else {
            $parts[] = "old bonds bind them" . $historyText;
        }
    } elseif (!empty($conflictTypes)) {
        $parts[] = "past debts come due" . $historyText;
    }
    
    // Add background context
    if (!empty($backgrounds) && count($parts) < 2) {
        $parts[] = str_replace('-', ' ', $backgrounds[0]) . " background";
    }
    
    // Add motivations
    if (!empty($motivations) && count($parts) < 2) {
        $parts[] = "driven by " . strtolower($motivations[0]);
    }
    
    if (!empty($parts)) {
        return ucfirst(implode("; ", $parts));
    }
    
    if (count($uniqueLoyalties) > 1) {
        return "Competing loyalties create tension";
    }
    
    return "Personal histories intertwine";
}

function getFutureGlimpse($events, $currentEvent, $world) {
    // This glimpse shows what's happening globally, but should be very selective
    // Only show when there's something truly interesting happening elsewhere
    
    $activeStories = array_filter($world['storyThreads'] ?? [], function($s) {
            return !($s['resolved'] ?? false);
        });

    // Only show if there are HIGH-TENSION or CLIMAX stories
    if (!empty($activeStories)) {
        $interestingStories = array_filter($activeStories, function($s) {
            $tension = $s['tension'] ?? 0;
            $phase = $s['phase'] ?? 'unfolding';
            return $tension >= 8 || $phase === 'climax';
        });
        
        if (!empty($interestingStories)) {
            // Sort by tension
            usort($interestingStories, function($a, $b) {
                return ($b['tension'] ?? 0) <=> ($a['tension'] ?? 0);
            });
            
            // Show only the top 1-2 most interesting
            $topStories = array_slice($interestingStories, 0, 2);
            $parts = [];
            
            foreach ($topStories as $story) {
                $type = $story['type'] ?? 'story';
                $phase = $story['phase'] ?? 'unfolding';
                $tension = $story['tension'] ?? 0;
                $typeName = ucfirst($type);
                
                if ($phase === 'climax' && $tension >= 8) {
                    $parts[] = "a $typeName reaches its breaking point";
                } elseif ($phase === 'climax') {
                    $parts[] = "a $typeName approaches its climax";
                } elseif ($tension >= 8) {
                    $parts[] = "a high-stakes $typeName escalates";
                }
            }
            
            if (!empty($parts)) {
                if (count($parts) === 1) {
                    return ucfirst($parts[0]) . " elsewhere";
                } else {
                    return ucfirst(implode(' and ', $parts)) . " elsewhere";
                }
            }
        }
    }

    // Very selective fallback - only for exceptional situations
    $travelingParties = count(array_filter($world['parties'] ?? [], function($p) {
        return ($p['status'] ?? '') === 'travel';
    }));
    $activeArmies = count(array_filter($world['armies'] ?? [], function($a) {
        return ($a['status'] ?? 'idle') !== 'defeated';
    }));

    if ($travelingParties >= 10 && $activeArmies >= 3) {
        return "$travelingParties travelers and $activeArmies armies move across the land";
    } else {
        return '';
    }
}

function getCharacterGlimpse($world, $actors) {
    if (empty($actors)) return '';

    $actorCount = count($actors);
    $totalNPCs = count($world['npcs'] ?? []);
    $deepNPCs = count(array_filter($world['npcs'] ?? [], function($npc) {
        return !empty($npc['depth']);
    }));

    $totalRelationships = 0;
    foreach ($world['npcs'] ?? [] as $npc) {
        if (!empty($npc['depth']['relationships'])) {
            $totalRelationships += count($npc['depth']['relationships']);
        }
    }

    // Show actual character depth data
    if ($actorCount >= 4) {
        return "$actorCount characters bring their histories together";
    } elseif ($actorCount === 3) {
        return "Three individuals with layered backstories";
    } elseif ($actorCount === 2) {
        return "Two characters shaped by $totalRelationships total relationships";
    } elseif ($deepNPCs > $totalNPCs * 0.7) {
        return "World of $totalNPCs richly detailed characters";
    } elseif ($totalRelationships > 30) {
        return "$totalRelationships relationship threads weave through lives";
    } else {
        return "$deepNPCs characters carry depth beyond their roles";
    }
}

function getEmergentConnections($events, $currentEvent, $world, $maxConnections = 3) {
    $connections = [];
    $currentIndex = null;

    // Find current event index
    foreach ($events as $i => $event) {
        if ($event === $currentEvent) {
            $currentIndex = $i;
            break;
        }
    }

    if ($currentIndex === null) return $connections;

    $actors = $currentEvent['actors'] ?? [];
    $location = $currentEvent['location'] ?? '';
    $category = $currentEvent['category'] ?? '';

    // Look at recent events (within last 10 events) for connections
    $searchRange = min(10, count($events) - $currentIndex - 1);
    for ($i = $currentIndex + 1; $i < $currentIndex + 1 + $searchRange && $i < count($events); $i++) {
        $event = $events[$i];
        $relevance = 0;
        $connectionType = '';

        // Same location = highly relevant
        if ($location && ($event['location'] ?? '') === $location) {
            $relevance += 3;
            $connectionType = 'location';
        }

        // Shared actors = very relevant
        if (!empty($actors) && !empty($event['actors'])) {
            $sharedActors = array_intersect($actors, $event['actors']);
            if (!empty($sharedActors)) {
                $relevance += 4;
                $connectionType = 'character';
            }
        }

        // Related categories (e.g., faction -> war, trade -> town)
        $relatedCategories = [
            'faction' => ['war', 'town'],
            'war' => ['faction', 'town', 'road'],
            'trade' => ['town', 'road', 'naval'],
            'town' => ['faction', 'war', 'trade', 'road'],
            'road' => ['town', 'trade', 'war'],
            'naval' => ['trade', 'war']
        ];

        if (isset($relatedCategories[$category]) && in_array($event['category'], $relatedCategories[$category])) {
            $relevance += 2;
            $connectionType = 'category';
        }

        if ($relevance >= 2) {
            $timeDiff = strtotime($event['worldTime']) - strtotime($currentEvent['worldTime']);
            $timeStr = $timeDiff > 0 ? '+' . formatTimeDifference($timeDiff) : formatTimeDifference($timeDiff);

            $connections[] = [
                'event' => $event,
                'relevance' => $relevance,
                'type' => $connectionType,
                'timeDiff' => $timeStr,
                'direction' => 'future'
            ];
        }
    }

    // Sort by relevance and limit
    usort($connections, function($a, $b) {
        return $b['relevance'] <=> $a['relevance'];
    });

    $connections = array_slice($connections, 0, $maxConnections);

    // Format for display
    $formatted = [];
    foreach ($connections as $conn) {
        $event = $conn['event'];
        $typeIcon = [
            'location' => '📍',
            'character' => '👥',
            'category' => '🔗'
        ][$conn['type']] ?? '➡️';

        $formatted[] = sprintf(
            "%s %s %s",
            $typeIcon,
            $conn['timeDiff'],
            htmlspecialchars($event['summary'])
        );
    }

    return $formatted;
}

// Find active story threads involving this actor or location (enhanced version)
function getActiveStoriesEnhanced($world, $actors, $location) {
    if (!$world || empty($world['storyThreads'])) return [];
    $contexts = [];

    foreach ($world['storyThreads'] as $story) {
        if ($story['resolved'] ?? false) continue;

        $match = false;
        $relevantActors = [];

        if ($location && ($story['location'] ?? '') === $location) $match = true;
        if (!empty($actors) && !empty($story['actors'])) {
            foreach ($actors as $actor) {
                if (in_array($actor, $story['actors'])) {
                    $match = true;
                    $relevantActors[] = $actor;
                }
            }
        }

        if ($match) {
            $contextParts = [];
            $context = $story['context'] ?? [];

            // Actor motivations from story context
            if (!empty($context['motivations']) && !empty($relevantActors)) {
                foreach ($relevantActors as $actor) {
                    if (isset($context['motivations'][$actor])) {
                        $motivation = $context['motivations'][$actor];
                        $contextParts[] = "$actor: $motivation";
                    }
                }
            }

            // Story actor relationships
            if (!empty($context['actorRelationships'])) {
                $relationships = $context['actorRelationships'];
                if (count($relationships) <= 3) { // Limit to avoid huge tooltips
                    $contextParts = array_merge($contextParts, $relationships);
    } else {
                    $contextParts[] = implode('; ', array_slice($relationships, 0, 2)) . "...";
                }
            }

            // Story themes
            if (!empty($context['themes'])) {
                $themes = $context['themes'];
                $contextParts[] = "Story themes: " . implode(', ', $themes);
            }

            // Key locations from story
            if (!empty($context['keyLocations'])) {
                $keyLocs = $context['keyLocations'];
                if ($location && !in_array($location, $keyLocs)) {
                    $keyLocs = array_diff($keyLocs, [$location]); // Don't duplicate current location
                }
                if (!empty($keyLocs)) {
                    $contextParts[] = "Key locations: " . implode(', ', array_slice($keyLocs, 0, 3));
                }
            }

            // Branching state (future possibilities)
            $branching = $story['branchingState'] ?? [];
            if (!empty($branching['choices'])) {
                $choices = $branching['choices'];
                $contextParts[] = "Future possibilities: " . implode('; ', array_slice($choices, 0, 2));
            }

            if (!empty($contextParts)) {
                $title = $story['title'] ?? 'Unknown tale';
                $contexts[] = "From \"$title\":\n" . implode("\n", $contextParts);
            }
        }
    }

    return $contexts;
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

// Get story context (motivations, relationships, themes) for actors/location in this event
function getStoryContextForEvent($world, $actors, $location) {
    if (!$world || empty($world['storyThreads'])) return [];
    $contexts = [];

    foreach ($world['storyThreads'] as $story) {
        if ($story['resolved'] ?? false) continue;

        $match = false;
        $relevantActors = [];

        if ($location && ($story['location'] ?? '') === $location) $match = true;
        if (!empty($actors) && !empty($story['actors'])) {
            foreach ($actors as $actor) {
                if (in_array($actor, $story['actors'])) {
                    $match = true;
                    $relevantActors[] = $actor;
                }
            }
        }

        if ($match) {
            $contextParts = [];
            $context = $story['context'] ?? [];

            // Actor motivations from story context
            if (!empty($context['motivations']) && !empty($relevantActors)) {
                foreach ($relevantActors as $actor) {
                    if (isset($context['motivations'][$actor])) {
                        $motivation = $context['motivations'][$actor];
                        $contextParts[] = "$actor: $motivation";
                    }
                }
            }

            // Story actor relationships
            if (!empty($context['actorRelationships'])) {
                $relationships = $context['actorRelationships'];
                if (count($relationships) <= 3) { // Limit to avoid huge tooltips
                    $contextParts = array_merge($contextParts, $relationships);
                } else {
                    $contextParts[] = implode('; ', array_slice($relationships, 0, 2)) . "...";
                }
            }

            // Story themes
            if (!empty($context['themes'])) {
                $themes = $context['themes'];
                $contextParts[] = "Story themes: " . implode(', ', $themes);
            }

            // Key locations from story
            if (!empty($context['keyLocations'])) {
                $keyLocs = $context['keyLocations'];
                if ($location && !in_array($location, $keyLocs)) {
                    $keyLocs = array_diff($keyLocs, [$location]); // Don't duplicate current location
                }
                if (!empty($keyLocs)) {
                    $contextParts[] = "Key locations: " . implode(', ', array_slice($keyLocs, 0, 3));
                }
            }

            // Branching state (future possibilities)
            $branching = $story['branchingState'] ?? [];
            if (!empty($branching['choices'])) {
                $choices = $branching['choices'];
                $contextParts[] = "Future possibilities: " . implode('; ', array_slice($choices, 0, 2));
            }

            if (!empty($contextParts)) {
                $title = $story['title'] ?? 'Unknown tale';
                $contexts[] = "From \"$title\":\n" . implode("\n", $contextParts);
            }
        }
    }

    return $contexts;
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

    $realMonth = (int)$dt->format('n'); // 1-12
    $realDay = (int)$dt->format('j');   // 1-31
    $realYear = (int)$dt->format('Y');

    $monthMap = [
        1 => 'January', 2 => 'February', 3 => 'March', 4 => 'April', 5 => 'May', 6 => 'June',
        7 => 'July', 8 => 'August', 9 => 'September', 10 => 'October', 11 => 'November', 12 => 'December'
    ];

    $monthName = $monthMap[$realMonth] ?? 'Unknown';
    $ordinal = getOrdinal($realDay);

    // Real calendar format: "January 5th, 2026 09:00"
    return "$monthName $realDay$ordinal, $realYear " . $dt->format('H:i');
}

function getOrdinal($n) {
    $s = ['th', 'st', 'nd', 'rd'];
    $v = $n % 100;
    return $s[($v - 20) % 10] ?? $s[$v] ?? $s[0];
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="refresh" content="60">
    <title>The Ghost Campaign</title>
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
        
        .warning {
            background: #2d2a1f;
            border: 1px solid #5c4f27;
            color: #fbbf24;
            padding: 12px 16px;
            border-radius: 6px;
            margin-bottom: 20px;
            font-size: 13px;
        }
        
        .warning-minor {
            background: #1f2d2a;
            border: 1px solid #275c4f;
            color: #4ade80;
        }
        
        .warning small {
            color: #9ca3af;
        }
        
        .status {
            font-weight: 600;
            font-size: 11px;
            padding: 2px 8px;
            border-radius: 4px;
        }
        
        .status-running {
            color: #4ade80;
            background: #1a2d1f;
        }
        
        .status-stale {
            color: #fbbf24;
            background: #2d2a1f;
        }
        
        .status-stopped {
            color: #f87171;
            background: #2d1f1f;
            animation: pulse 2s infinite;
        }
        
        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
        }
        
        .events {
            display: flex;
            flex-direction: column;
            gap: 2px;
        }
        
        .event {
            display: grid;
            grid-template-columns: auto 1fr;
            gap: 16px;
            padding: 8px 12px;
            background: #16161d;
            border-radius: 4px;
            align-items: start;
        }
        
        .event:hover {
            background: #1e1e28;
        }
        
        .event-meta {
            display: flex;
            flex-direction: column;
            gap: 4px;
            min-width: 130px;
        }
        
        .time {
            color: #6b6b7a;
            font-size: 11px;
            white-space: nowrap;
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
            width: fit-content;
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
        
        .export-buttons {
            display: flex;
            gap: 8px;
        }
        
        .export-btn {
            font-size: 11px;
            padding: 4px 10px;
            background: #1a1a24;
            border: 1px solid #2a2a35;
            border-radius: 4px;
            color: #94a3b8;
            text-decoration: none;
            transition: all 0.15s;
        }
        
        .export-btn:hover {
            background: #252530;
            border-color: #c084fc;
            color: #c084fc;
            text-decoration: none;
        }
        
        .entity-filter {
            position: relative;
            display: flex;
            align-items: center;
        }
        
        .entity-filter input {
            background: #1a1a24;
            border: 1px solid #2a2a35;
            border-radius: 4px;
            color: #e2e2e8;
            font-family: inherit;
            font-size: 11px;
            padding: 5px 10px;
            width: 160px;
            transition: all 0.15s;
        }
        
        .entity-filter input:focus {
            outline: none;
            border-color: #c084fc;
            background: #1e1e28;
        }
        
        .entity-filter input::placeholder {
            color: #6b6b7a;
        }
        
        .clear-filter {
            position: absolute;
            right: 6px;
            color: #6b6b7a;
            font-size: 14px;
            line-height: 1;
            text-decoration: none;
            padding: 2px 4px;
        }
        
        .clear-filter:hover {
            color: #f87171;
            text-decoration: none;
        }
        
        .filter-active {
            background: #1f1a2d;
            border: 1px solid #c084fc40;
            border-radius: 6px;
            padding: 8px 12px;
            margin-bottom: 16px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 12px;
        }
        
        .filter-active .filter-label {
            color: #c084fc;
        }
        
        .filter-active .filter-count {
            color: #6b6b7a;
        }
        
        /* Pagination styles */
        .pagination-link {
            padding: 4px 8px;
            background: #1a1a24;
            border: 1px solid #2a2a35;
            border-radius: 4px;
            transition: all 0.2s;
        }
        
        .pagination-link:hover {
            background: #252530;
            border-color: #3a3a45;
        }
        
        .pagination-current {
            padding: 4px 8px;
            background: #c084fc;
            color: #0f0f14;
            border-radius: 4px;
            font-weight: 600;
        }
        
        .pagination-disabled {
            padding: 4px 8px;
            color: #3a3a45;
            border: 1px solid #2a2a35;
            border-radius: 4px;
            cursor: not-allowed;
        }
        
        select {
            cursor: pointer;
        }
        
        select:hover {
            border-color: #3a3a45;
        }
        
        /* Mobile responsive */
        @media (max-width: 640px) {
            body {
                font-size: 14px;
            }
            
            .container {
                padding: 12px;
            }
            
            header {
                padding-bottom: 12px;
                margin-bottom: 16px;
            }
            
            header > div:first-child {
                flex-wrap: wrap;
            }
            
            h1 {
                font-size: 14px;
            }
            
            .entity-filter input {
                width: 120px;
            }
            
            .export-buttons {
                gap: 4px;
            }
            
            .export-btn {
                padding: 4px 8px;
                font-size: 10px;
            }
            
            .filter-active {
                flex-direction: column;
                gap: 4px;
                align-items: flex-start;
            }
            
            .meta {
                flex-wrap: wrap;
                gap: 8px 16px;
            }
            
            .event {
                display: flex;
                flex-direction: column;
                gap: 8px;
                padding: 12px;
            }
            
            .event-meta {
                flex-direction: row;
                justify-content: space-between;
                align-items: center;
                min-width: auto;
            }
            
            .time {
                font-size: 12px;
            }
            
            .category {
                font-size: 9px;
            }
            
            .summary {
                font-size: 14px;
                line-height: 1.5;
            }
            
            .details {
                font-size: 13px;
            }
            
            .actors {
                font-size: 12px;
            }
            
            footer {
                flex-direction: column;
                gap: 8px;
                text-align: center;
            }
            
            /* Tooltip on mobile - fixed at bottom */
            .custom-tooltip {
                max-width: none;
                width: calc(100vw - 24px);
                left: 12px !important;
                right: 12px !important;
                bottom: 12px !important;
                top: auto !important;
                font-size: 12px;
                max-height: 40vh;
                overflow-y: auto;
            }
        }
        
        /* Custom styled tooltip */
        .has-tooltip {
            position: relative;
            cursor: help;
        }
        
        .custom-tooltip {
            position: fixed;
            z-index: 1000;
            max-width: 500px;
            padding: 10px 14px;
            background: linear-gradient(135deg, #1a1a24 0%, #1e1e2a 100%);
            border: 1px solid #4a4a5a;
            border-radius: 8px;
            box-shadow: 0 12px 40px rgba(0,0,0,0.6), 0 0 20px rgba(138, 43, 226, 0.1);
            font-size: 12px;
            line-height: 1.4;
            color: #d4d4e0;
            font-style: italic;
            text-align: center;
            pointer-events: none;
            opacity: 0;
            transition: opacity 0.2s ease;
        }
        
        .custom-tooltip.visible {
            opacity: 1;
        }
        
        .custom-tooltip .tt-header {
            color: #a78bfa;
            font-weight: 500;
            font-size: 11px;
            letter-spacing: 0.5px;
            margin-bottom: 6px;
            opacity: 0.8;
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

        .custom-tooltip .emergent-connection {
            color: #60a5fa;
            font-weight: 500;
        }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 16px;">
                <div>
                    <h1>THE GHOST CAMPAIGN</h1>
                    <h2>A BECMI event log</h2>
                </div>
                <div style="display: flex; gap: 12px; align-items: center;">
                    <div class="entity-filter">
                        <input type="text" id="entitySearch" placeholder="Filter by entity..." value="<?= htmlspecialchars($entityFilter) ?>" />
                        <?php if ($entityFilter): ?>
                        <a href="?" class="clear-filter" title="Clear filter">×</a>
                        <?php endif; ?>
                    </div>
                    <div class="export-buttons">
                        <a href="?export=world" class="export-btn" title="Download world.json">World</a>
                        <a href="?export=events" class="export-btn" title="Download events.jsonl">Events</a>
                    </div>
                </div>
            </div>
            <div class="meta">
                <?php if ($world): ?>
                <span><span class="dot">●</span> <?= htmlspecialchars($world['archetype'] ?? 'Unknown') ?></span>
                <span><?= count($world['settlements'] ?? []) ?> settlements</span>
                <span><?= count($world['parties'] ?? []) ?> parties</span>
                <span>Seed: <?= htmlspecialchars($world['seed'] ?? '?') ?></span>
                <?php endif; ?>
                
                <?php if ($simStatus === 'running'): ?>
                <span class="status status-running" title="systemctl: <?= $systemctlOutput ?: 'process running' ?>">● Live</span>
                <?php elseif ($simStatus === 'stale'): ?>
                <span class="status status-stale" title="No events in <?= $simStaleMinutes ?> min - service may be idle">● Stale (<?= $simStaleMinutes ?>m)</span>
                <?php elseif ($simStatus === 'stopped'): ?>
                <span class="status status-stopped" title="systemctl: <?= $systemctlOutput ?: 'process not found' ?>">● Stopped</span>
                <?php endif; ?>
            </div>
        </header>
        
        <?php if ($simStatus === 'stopped'): ?>
        <div class="warning">
            ⚠️ Simulation appears to have stopped. Last event was <?= floor($simStaleMinutes / 60) ?>h <?= $simStaleMinutes % 60 ?>m ago.
            <?php if ($simLastUpdate): ?>
            <br><small>Last logged: <?= htmlspecialchars($simLastUpdate) ?></small>
            <?php endif; ?>
        </div>
        <?php elseif ($simStatus === 'stale'): ?>
        <div class="warning warning-minor">
            ⏳ No new events in <?= $simStaleMinutes ?> minutes. Simulation may be paused or slow.
        </div>
        <?php endif; ?>
        
        <?php if ($error): ?>
        <div class="error"><?= htmlspecialchars($error) ?></div>
        <?php endif; ?>
        
        <?php if ($entityFilter): ?>
        <div class="filter-active">
            <span class="filter-label">Showing events matching: <strong><?= htmlspecialchars($entityFilter) ?></strong></span>
            <span class="filter-count"><?= $totalEvents ?> result<?= $totalEvents !== 1 ? 's' : '' ?></span>
        </div>
        <?php endif; ?>
        
        <div class="events">
            <?php foreach ($events as $e): 
                $cat = $e['category'] ?? 'system';
                $color = $categoryColors[$cat] ?? '#94a3b8';
            ?>
            <div class="event">
                <div class="event-meta">
                    <div class="time" title="<?= htmlspecialchars($e['worldTime'] ?? '') ?>"><?= formatWorldDate($e['worldTime'] ?? '') ?></div>
                    <div class="category" style="color: <?= $color ?>"><?= htmlspecialchars($cat) ?></div>
                </div>
                <div class="content">
                    <?php
                    // Build SUBTLE contextual glimpses - hints of deeper simulation currents
                    $glimpses = [];
                    $actors = $e['actors'] ?? [];
                    $location = $e['location'] ?? '';

                    // GLIMPSE 1: One intriguing story thread (not all of them)
                    $storyGlimpse = getStoryGlimpse($world, $actors, $location);
                    if ($storyGlimpse) {
                        $glimpses[] = $storyGlimpse;
                    }

                    // GLIMPSE 2: One hidden motivation or relationship (not all relationships)
                    $motivationGlimpse = getMotivationGlimpse($world, $actors);
                    if ($motivationGlimpse) {
                        $glimpses[] = $motivationGlimpse;
                    }

                    // GLIMPSE 3: One intriguing future connection (not all emergent links)
                    $futureGlimpse = getFutureGlimpse($events, $e, $world);
                    if ($futureGlimpse) {
                        $glimpses[] = $futureGlimpse;
                    }

                    // GLIMPSE 4: One subtle character insight (not full backstory)
                    $characterGlimpse = getCharacterGlimpse($world, $actors);
                    if ($characterGlimpse) {
                        $glimpses[] = $characterGlimpse;
                    }

                    $tooltip = !empty($glimpses) ? "💫 " . implode(" · ", $glimpses) : "";
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
                <div class="event-meta">
                    <div class="time">—</div>
                    <div class="category">system</div>
                </div>
                <div class="content">
                    <div class="summary">No events yet. Start the simulation!</div>
                </div>
            </div>
            <?php endif; ?>
        </div>
        
        <footer>
            <div style="display: flex; flex-direction: column; gap: 12px;">
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
                    <span>
                        Showing <?= count($events) ?> of <?= $totalEvents ?> events 
                        <?php if ($totalPages > 1): ?>
                        (page <?= $page ?> of <?= $totalPages ?>)
                        <?php endif; ?>
                        · Auto-refresh: 60s
                    </span>
                    <span style="display: flex; align-items: center; gap: 12px;">
                        <label for="order" style="color: #6b6b7a; font-size: 11px;">Order:</label>
                        <select id="order" onchange="changeOrder(this.value)" style="background: #1a1a24; border: 1px solid #2a2a35; color: #e2e2e8; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-family: inherit;">
                            <option value="newest" <?= $order === 'newest' ? 'selected' : '' ?>>Newest First</option>
                            <option value="oldest" <?= $order === 'oldest' ? 'selected' : '' ?>>Oldest First (Jan 1)</option>
                        </select>
                        <label for="perPage" style="color: #6b6b7a; font-size: 11px;">Per page:</label>
                        <select id="perPage" onchange="changePerPage(this.value)" style="background: #1a1a24; border: 1px solid #2a2a35; color: #e2e2e8; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-family: inherit;">
                            <option value="20" <?= $limit == 20 ? 'selected' : '' ?>>20</option>
                            <option value="50" <?= $limit == 50 ? 'selected' : '' ?>>50</option>
                            <option value="100" <?= $limit == 100 ? 'selected' : '' ?>>100</option>
                            <option value="200" <?= $limit == 200 ? 'selected' : '' ?>>200</option>
                            <option value="500" <?= $limit == 500 ? 'selected' : '' ?>>500</option>
                        </select>
                    </span>
                </div>
                
                <?php if ($totalPages > 1): ?>
                <div style="display: flex; justify-content: center; align-items: center; gap: 8px; flex-wrap: wrap;">
                    <?php
                    // Build pagination links
                    $queryParams = $_GET;
                    $queryParams['limit'] = $limit;
                    $queryParams['order'] = $order;
                    
                    // First page
                    if ($page > 1) {
                        $queryParams['page'] = 1;
                        $firstUrl = '?' . http_build_query($queryParams);
                        echo '<a href="' . htmlspecialchars($firstUrl) . '" class="pagination-link">« First</a>';
                    } else {
                        echo '<span class="pagination-disabled">« First</span>';
                    }
                    
                    // Previous page
                    if ($page > 1) {
                        $queryParams['page'] = $page - 1;
                        $prevUrl = '?' . http_build_query($queryParams);
                        echo '<a href="' . htmlspecialchars($prevUrl) . '" class="pagination-link">‹ Prev</a>';
                    } else {
                        echo '<span class="pagination-disabled">‹ Prev</span>';
                    }
                    
                    // Page numbers (show up to 7 pages around current)
                    $startPage = max(1, $page - 3);
                    $endPage = min($totalPages, $page + 3);
                    
                    if ($startPage > 1) {
                        echo '<span style="color: #6b6b7a; padding: 4px 8px;">...</span>';
                    }
                    
                    for ($i = $startPage; $i <= $endPage; $i++) {
                        if ($i == $page) {
                            echo '<span class="pagination-current">' . $i . '</span>';
                        } else {
                            $queryParams['page'] = $i;
                            $pageUrl = '?' . http_build_query($queryParams);
                            echo '<a href="' . htmlspecialchars($pageUrl) . '" class="pagination-link">' . $i . '</a>';
                        }
                    }
                    
                    if ($endPage < $totalPages) {
                        echo '<span style="color: #6b6b7a; padding: 4px 8px;">...</span>';
                    }
                    
                    // Next page
                    if ($page < $totalPages) {
                        $queryParams['page'] = $page + 1;
                        $nextUrl = '?' . http_build_query($queryParams);
                        echo '<a href="' . htmlspecialchars($nextUrl) . '" class="pagination-link">Next ›</a>';
                    } else {
                        echo '<span class="pagination-disabled">Next ›</span>';
                    }
                    
                    // Last page
                    if ($page < $totalPages) {
                        $queryParams['page'] = $totalPages;
                        $lastUrl = '?' . http_build_query($queryParams);
                        echo '<a href="' . htmlspecialchars($lastUrl) . '" class="pagination-link">Last »</a>';
                    } else {
                        echo '<span class="pagination-disabled">Last »</span>';
                    }
                    ?>
                </div>
                <?php endif; ?>
            </div>
        </footer>
    </div>
    
    <!-- Custom tooltip container -->
    <div id="tooltip" class="custom-tooltip"></div>
    
    <script>
    function changePerPage(value) {
        const url = new URL(window.location);
        url.searchParams.set('limit', value);
        url.searchParams.set('page', '1'); // Reset to first page when changing per-page
        window.location.href = url.toString();
    }
    
    function changeOrder(value) {
        const url = new URL(window.location);
        url.searchParams.set('order', value);
        url.searchParams.set('page', '1'); // Reset to first page when changing order
        window.location.href = url.toString();
    }
    
    function filterByEntity(value) {
        const url = new URL(window.location);
        if (value.trim()) {
            url.searchParams.set('entity', value.trim());
        } else {
            url.searchParams.delete('entity');
        }
        url.searchParams.set('page', '1'); // Reset to first page when filtering
        window.location.href = url.toString();
    }
    
    // Entity search input handler
    document.getElementById('entitySearch')?.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            filterByEntity(this.value);
        }
    });
    
    (function() {
        const tooltip = document.getElementById('tooltip');
        if (!tooltip) {
            console.error('Tooltip element not found!');
            return;
        }
        let showTimeout;
        let activeEl = null;
        const isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
        
        // Helper to escape HTML for safe display
        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }
        
        // Format tooltip with styled sections
        function formatTooltip(raw) {
            const lines = raw.split('\n');
            let html = '';
            let inEmergentSection = false;

            for (const line of lines) {
                const headerMatch = line.match(/^═══ (.+) ═══$/);
                if (headerMatch) {
                    const header = headerMatch[1];
                    if (header === 'STORY CONTEXT') {
                        html += '<div class="tt-header">📖 ' + escapeHtml(header) + '</div>';
                    } else if (header === 'ACTIVE PLOTS') {
                        html += '<div class="tt-header">🎭 ' + escapeHtml(header) + '</div>';
                    } else if (header === 'RELATIONSHIPS') {
                        html += '<div class="tt-header">🤝 ' + escapeHtml(header) + '</div>';
                    } else if (header === 'EMERGENT LINKS') {
                        html += '<div class="tt-header">🔗 ' + escapeHtml(header) + '</div>';
                        inEmergentSection = true;
                    } else {
                        html += '<div class="tt-header">' + escapeHtml(header) + '</div>';
                        inEmergentSection = false;
                    }
                    continue;
                }

                // Handle story context lines specially
                if (line.startsWith('From "') && line.includes('":')) {
                    const storyMatch = line.match(/From "([^"]+)":/);
                    if (storyMatch) {
                        const storyTitle = storyMatch[1];
                        html += '<div style="font-weight: 600; color: #fbbf24; margin-top: 4px;">From "' + escapeHtml(storyTitle) + '":</div>';
                        continue;
                    }
                }

                // Handle actor motivations (Name: motivation)
                const motivationMatch = line.match(/^([^:]+): (.+)$/);
                if (motivationMatch && !line.includes('"')) {
                    const [, actor, motivation] = motivationMatch;
                    html += '<div style="margin-left: 8px;"><strong style="color: #60a5fa;">' + escapeHtml(actor) + '</strong>: ' + escapeHtml(motivation) + '</div>';
                    continue;
                }

                let processedLine = escapeHtml(line);
                processedLine = processedLine.replace(/&quot;([^&]+)&quot;/g, '<span class="tt-quote">"$1"</span>');
                processedLine = processedLine.replace(/"([^"]+)"/g, '<span class="tt-quote">"$1"</span>');

                if (line.trim()) {
                    const classes = inEmergentSection ? 'emergent-connection' : '';
                    html += '<div class="' + classes + '">' + processedLine + '</div>';
                }
            }

            return html;
        }
        
        function showTooltip(el, x, y) {
            const text = el.getAttribute('data-tooltip');
            if (!text) return;
            
            tooltip.innerHTML = formatTooltip(text);
            activeEl = el;
            
            if (isMobile) {
                // Mobile: fixed at bottom
                tooltip.style.left = '';
                tooltip.style.top = '';
            } else {
                // Desktop: near cursor
                tooltip.style.left = x + 15 + 'px';
                tooltip.style.top = y + 15 + 'px';
            }
            
            tooltip.classList.add('visible');
            
            // Desktop: adjust if off-screen
            if (!isMobile) {
                const ttRect = tooltip.getBoundingClientRect();
                if (ttRect.right > window.innerWidth - 20) {
                    tooltip.style.left = (window.innerWidth - ttRect.width - 20) + 'px';
                }
                if (ttRect.bottom > window.innerHeight - 20) {
                    tooltip.style.top = (y - ttRect.height - 30) + 'px';
                }
            }
        }
        
        function hideTooltip() {
            clearTimeout(showTimeout);
            tooltip.classList.remove('visible');
            activeEl = null;
        }
        
        document.querySelectorAll('.has-tooltip').forEach(el => {
            // Desktop: hover events
            el.addEventListener('mouseenter', function(e) {
                if (isMobile) return;
                clearTimeout(showTimeout);
                showTimeout = setTimeout(() => showTooltip(this, e.clientX, e.clientY), 300);
            });
            
            el.addEventListener('mouseleave', function() {
                if (isMobile) return;
                hideTooltip();
            });
            
            el.addEventListener('mousemove', function(e) {
                if (isMobile) return;
                if (tooltip.classList.contains('visible')) {
                    tooltip.style.left = (e.clientX + 15) + 'px';
                    tooltip.style.top = (e.clientY + 15) + 'px';
                }
            });
            
            // Mobile: tap to toggle
            el.addEventListener('click', function(e) {
                if (!isMobile) return;
                e.preventDefault();
                if (activeEl === this) {
                    hideTooltip();
                } else {
                    showTooltip(this, 0, 0);
                }
            });
        });
        
        // Tap outside to close on mobile
        document.addEventListener('click', function(e) {
            if (isMobile && activeEl && !e.target.closest('.has-tooltip') && !e.target.closest('.custom-tooltip')) {
                hideTooltip();
            }
        });
    })();
    </script>
</body>
</html>

