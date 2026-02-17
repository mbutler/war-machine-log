/**
 * PROSE ENGINE - Rich narrative generation for emergent storytelling
 * 
 * This module generates varied, atmospheric prose for all game events.
 * Instead of repetitive templates, we use procedural combination of:
 * - Sensory details (sights, sounds, smells)
 * - Character reactions and emotions
 * - Environmental context (weather, time of day, season)
 * - Narrative callbacks to past events
 */

import { Random } from './rng.ts';
import { Terrain, Settlement, Party, NPC, WorldState, LogCategory } from './types.ts';

// Time of day flavor
export function getTimeOfDayPhase(hour: number): 'dawn' | 'morning' | 'midday' | 'afternoon' | 'dusk' | 'evening' | 'night' | 'deep-night' {
  if (hour >= 5 && hour < 7) return 'dawn';
  if (hour >= 7 && hour < 11) return 'morning';
  if (hour >= 11 && hour < 14) return 'midday';
  if (hour >= 14 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 20) return 'dusk';
  if (hour >= 20 && hour < 23) return 'evening';
  if (hour >= 23 || hour < 2) return 'night';
  return 'deep-night';
}

const TIME_DESCRIPTORS: Record<ReturnType<typeof getTimeOfDayPhase>, readonly string[]> = {
  dawn: [
    'as rose light crept across the land',
    'with the first cock-crow',
    'as mist still clung to low places',
    'while dew pearled on grass and stone',
    'as the world stirred from slumber',
  ],
  morning: [
    'under a brightening sky',
    'as folk went about their labors',
    'with the sun climbing steadily',
    'amid the bustle of morning trade',
    'as smoke rose from breakfast fires',
  ],
  midday: [
    'under the high sun',
    'as shadows pooled beneath eaves',
    'in the drowsy heat of noon',
    'while sensible folk sought shade',
    'as the bell tolled the sixth hour',
  ],
  afternoon: [
    'as the day wore on',
    'with lengthening shadows',
    'in the golden afternoon light',
    'as travelers grew road-weary',
    'while the sun began its descent',
  ],
  dusk: [
    'as purple shadows gathered',
    'with the setting of the sun',
    'as lanterns were kindled',
    'in the gloaming hour',
    'as bats took wing',
  ],
  evening: [
    'by candlelight and hearth-glow',
    'as the stars emerged one by one',
    'with ale flowing in taprooms',
    'as songs rose from dim taverns',
    'under an indigo sky',
  ],
  night: [
    'under a canopy of stars',
    'as owls hunted in darkness',
    'with only moonlight for company',
    'in the hush of late night',
    'while decent folk lay sleeping',
  ],
  'deep-night': [
    'in the witching hour',
    'as even the taverns fell silent',
    'when shadows grew deepest',
    'in the cold hours before dawn',
    'as the world held its breath',
  ],
};

// Terrain-specific atmospheric details
const TERRAIN_ATMOSPHERE: Record<Terrain, { sights: string[]; sounds: string[]; smells: string[]; hazards: string[] }> = {
  road: {
    sights: [
      'wagon ruts worn deep into the earth',
      'a milestone marking leagues to the capital',
      'a wayside shrine with fresh offerings',
      'dust rising from distant hooves',
      "a peddler's cart overturned by the verge",
      'an abandoned cart with broken axles',
      'merchant stalls lined along the roadside',
      'a hanging sign creaking in the wind',
      'fresh horse droppings on the path',
      'a lone scarecrow guarding a field',
      'toll markers carved into boundary stones',
      'a caravan of wagons approaching from the distance',
      'the weathered remains of an old signpost',
      'a stone bridge arching over a muddy stream',
      'fresh graffiti on a merchant wagon',
      'a collapsed roadside well, long abandoned',
      'merchant flags fluttering from tall poles',
      'the faint outline of a ruined watchtower',
      'tracks of many booted feet in the soft earth',
      'a caravan guard sharpening his sword',
    ],
    sounds: [
      'the creak of wagon wheels',
      'distant hoofbeats',
      "a tinker's bell",
      'the song of road-weary pilgrims',
      'ravens arguing over carrion',
      'the jingle of harness bells',
      'merchants haggling over prices',
      'the flap of canvas wagon covers',
      'children laughing from a nearby farm',
      'the distant bark of a shepherd\'s dog',
      'caravan drivers shouting commands',
      'the clink of coins being counted',
      'wind whistling through fence posts',
      'the crunch of gravel under boots',
      'a lone traveler whistling a tune',
      'the rumble of distant thunder',
      'birds singing from roadside trees',
      'the occasional crack of a whip',
      'footsteps echoing on cobblestones',
      'the murmur of passing conversations',
    ],
    smells: [
      'road dust and horse sweat',
      'wildflowers along the verge',
      'smoke from a roadside camp',
      'the tang of iron from a smithy',
      'fresh bread from a traveler\'s pack',
      'leather and saddle soap',
      'wood smoke from distant chimneys',
      'the sharp scent of pine forests',
      'wet earth after recent rain',
      'hay bales stacked by the roadside',
      'the metallic tang of blood',
      'spices wafting from merchant wagons',
      'fresh manure from farm carts',
      'the sweet smell of wild berries',
      'tobacco smoke from a pipe',
      'the faint odor of decay',
      'perfume from a passing noble',
      'baking bread from a nearby inn',
      'fresh-cut hay in wagon beds',
      'the sharp tang of vinegar',
    ],
    hazards: [
      'a suspicious band loitering at the crossroads',
      'signs of recent violence: bloodstains, abandoned goods',
      'a broken bridge forcing a detour',
      'bandits watching from the treeline',
      'a rickety rope bridge over a gorge',
      'freshly dug pit traps hidden in grass',
      'a collapsed tunnel through a hill',
      'wolves howling in the distance',
      'a storm brewing on the horizon',
      'flooded ford making crossing dangerous',
      'a landslide blocking the path ahead',
      'poisonous snakes sunning on rocks',
      'a swarm of biting insects',
      'quicksand near the river crossing',
      'a weakened bridge creaking ominously',
      'bear tracks crossing the road',
      'freshly broken wagon wheel spokes',
      'a plague sign nailed to a tree',
      'suspicious footprints in the mud',
      'a hornet\'s nest in a low branch',
    ],
  },
  clear: {
    sights: [
      'golden wheat swaying in the breeze',
      'a shepherd minding distant flocks',
      'ancient standing stones on a hilltop',
      'a lone oak spreading its branches wide',
      'farmsteads dotting the gentle hills',
      'vast meadows stretching to the horizon',
      'a windmill turning lazily in the breeze',
      'herds of deer grazing peacefully',
      'plowed fields in neat geometric patterns',
      'a thatched cottage with smoke curling from the chimney',
      'stone fences dividing property lines',
      'a scarecrow dressed in ragged clothes',
      'wildflowers painting the landscape in color',
      'a distant village with church spires',
      'grazing cattle with bells around their necks',
      'hay bales scattered across harvested fields',
      'a dirt track winding through the countryside',
      'orchards heavy with ripening fruit',
      'sheep being herded by border collies',
      'a babbling brook cutting through green meadows',
    ],
    sounds: [
      'skylarks singing overhead',
      'the rustle of tall grass',
      'cattle lowing in distant fields',
      'wind sighing through grain',
      'frogs croaking in nearby ponds',
      'the distant clank of a blacksmith\'s hammer',
      'children playing in farmyards',
      'roosters crowing at dawn',
      'the buzz of bees in wildflower meadows',
      'waterwheels turning in streams',
      'sheep bells tinkling softly',
      'the flap of laundry on clotheslines',
      'farmers calling to their livestock',
      'the rustle of leaves in gentle breezes',
      'church bells ringing in the distance',
      'the low hum of summer insects',
      'dogs barking at passing travelers',
      'the crunch of gravel paths',
      'wind chimes on cottage porches',
      'the occasional rumble of cart wheels',
    ],
    smells: [
      'fresh-turned earth',
      'hay and clover',
      'the sweetness of ripening apples',
      'wood smoke from a cottage chimney',
      'new-mown grass and wild herbs',
      'fresh bread baking in ovens',
      'damp earth after morning dew',
      'the sharp scent of cut hay',
      'fruit ripening on orchard trees',
      'fresh manure spread on fields',
      'jasmine blooming in cottage gardens',
      'the clean smell of washed linen',
      'smoke from autumn bonfires',
      'wild mint crushed underfoot',
      'the metallic tang of well water',
      'freshly baked pies cooling on windowsills',
      'the earthy scent of root vegetables',
      'honeysuckle blooming on fences',
      'fresh milk from dairy barns',
      'the sharp tang of farm cider',
    ],
    hazards: [
      'tracks of some large beast in the soft earth',
      'a burned farmstead, still smoldering',
      'circling crows marking something dead',
      'poisonous snakes hiding in tall grass',
      'sudden drop-offs hidden by vegetation',
      'sinks holes in soft meadow soil',
      'flash floods during heavy rains',
      'rabid animals wandering the plains',
      'tornadoes forming on the horizon',
      'prairie fires spreading rapidly',
      'locust swarms devouring crops',
      'feral dogs hunting in packs',
      'unmarked wells covered by grass',
      'sudden fog reducing visibility',
      'lightning strikes during storms',
      'venomous spiders in hay bales',
      'sharp stones hidden in meadows',
      'sudden hailstorms',
      'marauding bandits using grass for cover',
      'contaminated water sources',
    ],
  },
  forest: {
    sights: [
      'ancient oaks draped in moss',
      'shafts of light piercing the canopy',
      'a clearing where standing stones lurked',
      'fungus growing in strange patterns',
      'a ruined tower choked by vines',
      'towering pines reaching for the sky',
      'a carpet of fallen autumn leaves',
      'moss-covered boulders scattered about',
      'a narrow path winding through underbrush',
      'sun-dappled glades with wildflowers',
      'ancient runes carved into tree bark',
      'a hunter\'s blind hidden in branches',
      'streams cutting through rocky beds',
      'fairy rings of mushrooms in clearings',
      'vines hanging like curtains from branches',
      'a hollow tree large enough to enter',
      'berries ripening on thorny bushes',
      'animal tracks in soft forest floor',
      'a hermit\'s hut overgrown with ivy',
      'lightning-struck trees split down the middle',
    ],
    sounds: [
      'branches creaking overhead',
      'unseen things rustling in undergrowth',
      'the tap of a woodpecker',
      'an eerie silence where birdsong ceased',
      'distant howling at dusk',
      'leaves crunching underfoot',
      'small streams bubbling over rocks',
      'wind whistling through pine needles',
      'owls hooting in the night',
      'squirrels chattering in the branches',
      'the distant crash of a falling tree',
      'frogs singing from hidden ponds',
      'the buzz of insects in the undergrowth',
      'rain dripping from leaves after a shower',
      'the crack of twigs snapping',
      'birds calling territorial warnings',
      'the rustle of small animals fleeing',
      'water dripping from moss-covered rocks',
      'the occasional snap of a trap',
      'echoes of distant axes chopping wood',
    ],
    smells: [
      'leaf mold and decay',
      'pine resin sharp and clean',
      'the musk of some passing beast',
      'rotting wood and toadstools',
      'wild mint and forest herbs',
      'damp earth and wet bark',
      'the sharp scent of pine sap',
      'wild berries crushed underfoot',
      'smoke from a distant campfire',
      'the clean smell of rain on leaves',
      'mushrooms sprouting after rain',
      'cedar wood and bark chips',
      'the faint scent of wild game',
      'honeysuckle blooming in clearings',
      'the earthy smell of truffles',
      'charred wood from lightning strikes',
      'fresh sawdust from logging',
      'the metallic tang of mineral springs',
      'juniper berries crushed on the path',
      'the sharp tang of wild onions',
    ],
    hazards: [
      'webs strung between trees, too large for ordinary spiders',
      'claw marks on bark, head-height or higher',
      'bones scattered near a dark hollow',
      'poisonous plants with alluring berries',
      'sudden drops into hidden ravines',
      'quick-mud along stream banks',
      'wolves hunting in coordinated packs',
      'bear dens marked by fresh diggings',
      'bandits using trees for ambush cover',
      'fallen trees blocking narrow paths',
      'vines that constrict when touched',
      'fungus that causes vivid hallucinations',
      'swarms of stinging insects',
      'sharp thorns on berry bushes',
      'unstable ground over abandoned mines',
      'caves that echo with unnatural sounds',
      'trees that bleed red sap',
      'mushrooms that scream when picked',
      'sudden fog that disorients travelers',
      'ancient curses bound to specific groves',
    ],
  },
  hills: {
    sights: [
      'cairns marking ancient graves',
      'the mouth of a cave, dark and inviting',
      'a ruined watchtower on the heights',
      'goats picking their way along cliffs',
      'mist pooling in the valleys below',
      'rolling hills covered in heather',
      'sheep grazing on steep slopes',
      'stone walls dividing hill farms',
      'ancient hill forts with crumbling walls',
      'narrow passes between rocky peaks',
      'waterfalls cascading down cliffs',
      'wild ponies roaming free',
      'quarries carved into hillside rock',
      'wind-bent trees clinging to slopes',
      'stone circles on hilltops',
      'abandoned shepherd huts',
      'hawk nests on rocky outcrops',
      'fossils embedded in cliff faces',
      'hot springs steaming in valleys',
      'zigzag paths climbing steep inclines',
    ],
    sounds: [
      'wind keening through rocky passes',
      'the clatter of loose stones',
      'a distant rockslide',
      'the scream of a hunting hawk',
      'sheep bells tinkling in the distance',
      'waterfalls roaring down cliffs',
      'wind whistling around boulders',
      'goats bleating on steep slopes',
      'the crunch of gravel under boots',
      'streams rushing through narrow gorges',
      'birds of prey crying overhead',
      'the distant lowing of cattle',
      'rain pattering on slate roofs',
      'thunder echoing between hills',
      'the occasional crack of splitting rock',
      'farmers calling to livestock',
      'wild ponies whinnying',
      'water wheels turning in streams',
      'the flap of laundry in the breeze',
      'church bells from valley villages',
    ],
    smells: [
      'heather and wild thyme',
      'mineral tang from exposed rock',
      'the cold scent of coming rain',
      'fresh mountain air and ozone',
      'sheep wool and lanolin',
      'damp moss on stone walls',
      'wild garlic growing in cracks',
      'smoke from peat fires',
      'freshly cut stone dust',
      'mineral springs with a metallic tang',
      'wild mint crushed on paths',
      'the sharp scent of gorse flowers',
      'damp earth in valley bottoms',
      'cedar trees lining streams',
      'the faint odor of sheep manure',
      'freshly baked bread from hill farms',
      'juniper berries on low bushes',
      'the clean smell of rain-washed rock',
      'wild roses blooming on slopes',
      'the sharp tang of mountain herbs',
    ],
    hazards: [
      'a rope bridge in poor repair',
      'fresh rockfall blocking the path',
      'smoke rising from caves—someone, or something, dwells within',
      'sheer drops with no guard rails',
      'loose scree sliding underfoot',
      'sudden mists reducing visibility',
      'bandits using hilltops for surveillance',
      'unstable cliffs prone to collapse',
      'flash floods in narrow valleys',
      'poisonous plants on rocky slopes',
      'bear dens in hillside caves',
      'loose stones starting rockslides',
      'treacherous paths washed out by rain',
      'sudden gusts of wind',
      'hidden sinkholes in meadows',
      'rabid animals in remote areas',
      'lightning strikes on exposed peaks',
      'frost heaves cracking pathways',
      'wild dogs hunting in packs',
      'ancient curses on hilltop monuments',
    ],
  },
  mountains: {
    sights: [
      'snow-capped peaks gleaming in sunlight',
      'a glacier grinding slowly downward',
      'the ruins of a dwarven gatehouse',
      'a frozen waterfall',
      'vast chasms with no visible bottom',
      'eagles soaring on thermal winds',
      'switchback paths climbing steep slopes',
      'avalanche scars on rocky faces',
      'mountain goats leaping between boulders',
      'hot springs steaming in rocky basins',
      'ancient petroglyphs on cliff walls',
      'copper deposits staining rock faces green',
      'crystal formations in cave mouths',
      'lightning-blasted trees at timberline',
      'stone cairns marking safe paths',
      'glaciers carving valleys below',
      'waterfalls plunging into deep pools',
      'condors circling high overhead',
      'meteor impact craters on peaks',
      'bridges spanning raging torrents',
    ],
    sounds: [
      'the groan of shifting ice',
      'thunder echoing between peaks',
      'the shriek of mountain winds',
      'ominous silence after an avalanche',
      'waterfalls roaring into gorges',
      'wind howling through rocky passes',
      'the crack of splitting rock',
      'avalanches rumbling in the distance',
      'eagles screaming overhead',
      'streams bubbling over smooth stones',
      'the occasional boom of falling ice',
      'wolves howling from distant valleys',
      'the crunch of boots on gravel',
      'wind chimes made of bone',
      'the distant toll of monastery bells',
      'thunder rolling between peaks',
      'the splash of mountain streams',
      'rockslides clattering down slopes',
      'the sharp crack of ice breaking',
      'wind whistling through cave entrances',
    ],
    smells: [
      'thin cold air',
      'sulfur from hot springs',
      'the iron tang of altitude',
      'fresh snow and ice crystals',
      'pine forests at lower elevations',
      'mineral-rich hot springs',
      'ozone from lightning strikes',
      'wildflowers blooming briefly',
      'charred wood from forest fires',
      'the sharp scent of juniper',
      'freshly quarried stone dust',
      'cedar incense from monasteries',
      'wild mint growing in cracks',
      'the faint metallic tang of ore',
      'crushed rock and gravel',
      'smoke from signal fires',
      'the clean smell of glacial melt',
      'wild berries ripening on bushes',
      'the sharp tang of alpine herbs',
      'fresh goat cheese from herds',
    ],
    hazards: [
      'unstable ice over deep crevasses',
      'giant footprints in the snow',
      'a cave mouth breathing warm, fetid air',
      'sudden blizzards reducing visibility',
      'rockslides triggered by footsteps',
      'altitude sickness and dizziness',
      'crevasses hidden by snow bridges',
      'mountain lions stalking travelers',
      'sudden fog in mountain passes',
      'lightning strikes on exposed ridges',
      'avalanches triggered by noise',
      'unstable snow bridges over chasms',
      'poisonous plants at high altitudes',
      'extreme cold and frostbite',
      'treacherous ice on steep slopes',
      'bandits using peaks for ambush',
      'sudden gusts of hurricane-force wind',
      'rock falls from crumbling cliffs',
      'contaminated water sources',
      'ancient curses on mountain shrines',
    ],
  },
  swamp: {
    sights: [
      'will-o-wisps dancing over dark water',
      'a drowned village, rooftops jutting above the murk',
      'twisted trees rising from fog',
      'bubbles rising from the deep',
      'a heron standing motionless, watching',
      'cypress trees draped in Spanish moss',
      'alligators sunning on muddy banks',
      'snakelike roots twisting through water',
      'fog-shrouded islands in the distance',
      'abandoned fishing boats rotting in shallows',
      'fireflies dancing at dusk',
      'moss hanging like curtains from branches',
      'sinking houses tilting into the mire',
      'dragonflies skimming the water surface',
      'ancient burial mounds half-submerged',
      'frog eyes gleaming in the darkness',
      'cattails swaying in gentle breezes',
      'the occasional flash of fish scales',
      'rusted tools protruding from mud',
      'vultures perched on dead snags',
    ],
    sounds: [
      'the croak of countless frogs',
      'something heavy sliding into water',
      'the buzz of biting flies',
      'sucking mud reluctant to release boots',
      'alligators bellowing in the night',
      'water dripping from hanging moss',
      'the splash of jumping fish',
      'wind rustling through cattails',
      'the distant hoot of owls',
      'mosquitoes buzzing in clouds',
      'the gurgle of methane bubbles',
      'tree frogs singing in chorus',
      'the occasional snap of a twig',
      'water lapping against rotting docks',
      'the flap of heron wings taking flight',
      'the deep rumble of bullfrogs',
      'squirrels chattering in cypress crowns',
      'the plop of turtles slipping into water',
      'distant thunder rolling through fog',
      'the whisper of wind through reeds',
    ],
    smells: [
      'rot and stagnant water',
      'the sweetness of decay',
      'methane rising from the depths',
      'damp earth and wet vegetation',
      'the sharp scent of cypress bark',
      'mud and decomposing leaves',
      'freshwater algae blooming',
      'wild onions growing in clearings',
      'smoke from distant cookfires',
      'the faint tang of salt water',
      'honeysuckle blooming on vines',
      'freshly cut marsh grass',
      'the earthy smell of peat',
      'fish guts from cleaning stations',
      'the sharp bite of black pepper plants',
      'jasmine blooming in the humid air',
      'the faint odor of gunpowder',
      'fresh-caught catfish frying',
      'the metallic tang of bog iron',
      'wild mint crushed underfoot',
    ],
    hazards: [
      'quicksand lurking beneath innocent-looking moss',
      'humanoid tracks leading into the mire—none returning',
      'a half-sunken boat, owner unknown',
      'venomous snakes hiding in roots',
      'alligator nests in shallow water',
      'sinking mud that traps the unwary',
      'malaria-carrying mosquitoes',
      'poisonous plants with attractive flowers',
      'sudden fog reducing visibility to feet',
      'crocodiles disguised as logs',
      'unstable ground over hidden waterways',
      'bandits using fog for ambush',
      'contaminated water causing illness',
      'leeches in stagnant pools',
      'sharp reeds that cut like razors',
      'sudden storms with lightning',
      'ancient curses on burial mounds',
      'fungus that causes fever dreams',
      'ghost lights leading travelers astray',
      'corrosive bog water damaging equipment',
    ],
  },
  desert: {
    sights: [
      'bleached bones half-buried in sand',
      'mirages shimmering on the horizon',
      'a ruined city of sandstone pillars',
      'an oasis ringed with palms',
      'vultures circling lazily overhead',
      'dunes shifting in the wind',
      'camel caravans crossing the sands',
      'ancient petroglyphs on canyon walls',
      'lightning striking distant mesas',
      'cacti blooming with vibrant flowers',
      'abandoned mining camps',
      'fossil beds exposed by erosion',
      'stone arches carved by wind',
      'salt flats gleaming white',
      'thunderheads forming over mountains',
      'rivers of sand flowing down slopes',
      'bedouin tents pitched in wadis',
      'meteor craters in the hardpan',
      'geyser cones venting steam',
      'caravanserais along ancient routes',
    ],
    sounds: [
      'the hiss of sand in the wind',
      'the scuttle of scorpions',
      'thunder of a distant sandstorm',
      'the cry of a desert hawk',
      'camels grumbling discontentedly',
      'wind whistling through canyon walls',
      'the crunch of boots on gravel',
      'the occasional crack of splitting rock',
      'jackals yipping in the night',
      'the flap of tent canvas',
      'water dripping in hidden springs',
      'the low hum of heat haze',
      'sand sliding down dune faces',
      'the distant toll of caravan bells',
      'owls hooting from canyon ledges',
      'the splash of oasis springs',
      'locusts buzzing in rare vegetation',
      'thunder echoing across vast distances',
      'the sharp crack of lightning',
      'wind chimes on desert shrines',
    ],
    smells: [
      'dry heat and dust',
      'the rare sweetness of date palms',
      'the musk of passing camels',
      'sagebrush and creosote',
      'the sharp tang of mineral springs',
      'smoke from desert cookfires',
      'the faint scent of ozone',
      'wildflowers blooming after rain',
      'freshly baked flatbread',
      'spices carried by traders',
      'the metallic tang of copper mines',
      'rain on hot sand creating steam',
      'jasmine blooming in oases',
      'the sharp bite of chili peppers',
      'freshly cut cactus pads',
      'smoke from signal fires',
      'the faint odor of decay',
      'fresh goat milk curdling',
      'cedar incense from shrines',
      'the clean smell of gypsum dust',
    ],
    hazards: [
      'signs of a sandstorm on the horizon',
      'a dried corpse clutching an empty waterskin',
      'strange geometric carvings in exposed bedrock',
      'scorpions hiding under rocks',
      'rattlesnakes coiled in shade',
      'sudden flash floods in wadis',
      'bandits using dunes for cover',
      'quicksand in dry riverbeds',
      'extreme heat causing heatstroke',
      'contaminated water sources',
      'cactus spines that cause infection',
      'sudden sandstorms blinding travelers',
      'jagged rocks cutting boots',
      'wild dogs hunting in packs',
      'ancient curses on desert ruins',
      'lightning strikes during storms',
      'sinkholes in gypsum flats',
      'venomous spiders in abandoned tents',
      'extreme cold at desert nights',
      'lost travelers turned hostile',
    ],
  },
  coastal: {
    sights: [
      'fishing boats bobbing in the harbor',
      'nets hung to dry on wooden frames',
      'seagulls wheeling over the docks',
      'a lighthouse standing sentinel on the headland',
      'driftwood scattered along the tideline',
    ],
    sounds: [
      'the cry of seabirds',
      'waves crashing against rocks',
      'the creak of mooring lines',
      'fishermen calling to one another',
    ],
    smells: [
      'salt spray and seaweed',
      'fresh fish and brine',
      'tar from boat repairs',
      'wood smoke from smokehouses',
    ],
    hazards: [
      'treacherous rocks hidden beneath the surf',
      'a wrecked ship visible at low tide',
      'smuggler caves in the cliffs',
    ],
  },
  ocean: {
    sights: [
      'endless blue stretching to the horizon',
      'distant sails on the edge of sight',
      'dolphins racing the bow wave',
      'dark shapes moving beneath the surface',
      'a school of flying fish breaking the surface',
    ],
    sounds: [
      'the endless rhythm of waves',
      'canvas snapping in the wind',
      'the groan of ship timbers',
      'the lonely cry of an albatross',
    ],
    smells: [
      'salt air and open water',
      'tar and rope',
      'the freshness of a sea breeze',
    ],
    hazards: [
      'storm clouds gathering on the horizon',
      'debris from a recent shipwreck',
      'an uncharted reef showing white water',
    ],
  },
  reef: {
    sights: [
      'colorful fish darting through coral',
      'the skeleton of a wrecked ship',
      'crystal-clear water revealing the seabed',
      'sea turtles gliding past',
      'white sand beneath turquoise shallows',
    ],
    sounds: [
      'waves breaking over the reef',
      'the click and rustle of crabs',
      'the splash of diving pelicans',
    ],
    smells: [
      'salt and sun-warmed sand',
      'seaweed drying on rocks',
      'the clean scent of tropical waters',
    ],
    hazards: [
      'razor-sharp coral lurking beneath the surface',
      'sharks patrolling the reef edge',
      'a sudden riptide pulling toward deeper water',
    ],
  },
  river: {
    sights: [
      'willows trailing in the current',
      'a stone bridge arching over the water',
      'fishermen in small boats',
      'a watermill turning steadily',
      'herons standing in the shallows',
    ],
    sounds: [
      'water rushing over stones',
      'the plop of jumping fish',
      'the call of kingfishers',
      'oars dipping rhythmically',
    ],
    smells: [
      'fresh water and wet earth',
      'water lilies in bloom',
      'the musk of river mud',
    ],
    hazards: [
      'rapids too dangerous for safe passage',
      'a flooded ford impassable on foot',
      'crocodiles sunning on the banks',
    ],
  },
};

// Settlement atmosphere by type
const SETTLEMENT_VIBES: Record<Settlement['type'], { bustle: string[]; tension: string[]; peace: string[] }> = {
  village: {
    bustle: [
      'chickens scattered before approaching travelers',
      "the blacksmith's hammer rang out steadily",
      'children chased each other through muddy lanes',
      'farmers argued over the price of grain',
    ],
    tension: [
      'doors were barred and shutters drawn',
      'watchmen eyed strangers with open suspicion',
      'whispered conversations fell silent at approach',
      'a gibbet creaked in the village square',
    ],
    peace: [
      'old men dozed on benches in the sun',
      'the smell of baking bread drifted from open doors',
      'a wedding party spilled laughing from the chapel',
      "children gathered to hear a pedlar's tales",
    ],
  },
  town: {
    bustle: [
      'merchants hawked wares in crowded market squares',
      'guild banners snapped in the breeze',
      "a crier announced the day's proclamations",
      'the town watch marched in ordered formation',
    ],
    tension: [
      'tavern brawls spilled into the streets',
      'tax collectors moved under armed guard',
      'gallows stood freshly constructed in the square',
      'rumors of plague set folk on edge',
    ],
    peace: [
      'fountain water sparkled in the afternoon sun',
      "minstrels played in the garden of the Merchant's Guild",
      'the cathedral bells marked the peaceful hours',
      'street performers drew laughing crowds',
    ],
  },
  city: {
    bustle: [
      'the roar of ten thousand souls going about their business',
      'carriages rattled over cobblestones',
      'exotic spices scented the market district',
      'foreign tongues mingled in the harbor quarter',
    ],
    tension: [
      'the city watch patrolled in force after dark',
      "a noble's retinue swept commoners from the path",
      "the executioner's block saw fresh use",
      'plague doctors stalked the poorer quarters',
    ],
    peace: [
      'great temples rose in marble splendor',
      'scholars debated in university cloisters',
      'a grand festival filled the streets with color',
      "the duke's gardens opened to public promenade",
    ],
  },
};

// Generate atmospheric opening for a scene
export function atmosphericOpening(
  rng: Random,
  worldTime: Date,
  terrain: Terrain,
  mood?: 'tense' | 'peaceful' | 'ominous' | 'exciting',
): string {
  const hour = worldTime.getUTCHours();
  const phase = getTimeOfDayPhase(hour);
  const timeDesc = rng.pick(TIME_DESCRIPTORS[phase]);
  const atmos = TERRAIN_ATMOSPHERE[terrain];

  const elements: string[] = [];
  if (rng.chance(0.6)) elements.push(rng.pick(atmos.sights));
  if (rng.chance(0.4)) elements.push(rng.pick(atmos.sounds));
  if (rng.chance(0.25)) elements.push(rng.pick(atmos.smells) + ' hung in the air');
  if (mood === 'ominous' && rng.chance(0.5)) elements.push(rng.pick(atmos.hazards));

  const detail = elements.length ? ` ${rng.pick(elements)}.` : '';
  return `${capitalize(timeDesc)}${detail}`;
}

// Generate settlement scene description
export function settlementScene(
  rng: Random,
  settlement: Settlement,
  worldTime: Date,
  tension?: number, // -3 to 3
): string {
  const vibes = SETTLEMENT_VIBES[settlement.type];
  const normalizedTension = tension ?? settlement.mood;

  let flavorPool: string[];
  if (normalizedTension >= 2) {
    flavorPool = vibes.tension;
  } else if (normalizedTension <= -2) {
    flavorPool = vibes.peace;
  } else {
    flavorPool = vibes.bustle;
  }

  const hour = worldTime.getUTCHours();
  const phase = getTimeOfDayPhase(hour);
  const timeDesc = rng.pick(TIME_DESCRIPTORS[phase]);

  return `${capitalize(rng.pick(flavorPool))} ${timeDesc}.`;
}

// Encounter flavor - makes each fight/meeting memorable
export function encounterFlavorText(
  rng: Random,
  foe: string,
  reaction: 'friendly' | 'cautious' | 'hostile',
  outcome: 'victory' | 'defeat' | 'negotiation' | 'flight',
  terrain: Terrain,
  actors: string[],
): { summary: string; details: string } {
  const party = actors[0] ?? 'The company';
  const atmos = TERRAIN_ATMOSPHERE[terrain];

  const FRIENDLY_SUMMARIES = [
    `${party} share a fire with wandering ${foe}`,
    `${party} trade news with passing ${foe}`,
    `${party} and ${foe} find common cause`,
    `${foe} offer ${party} aid on the road`,
    `${party} exchange stories with curious ${foe}`,
    `${party} share trail rations with hungry ${foe}`,
    `${foe} guide ${party} to a hidden spring`,
    `${party} learn local customs from friendly ${foe}`,
    `${foe} warn ${party} of dangers ahead`,
    `${party} assist ${foe} with a broken wagon`,
    `${foe} share hunting tips with ${party}`,
    `${party} trade crafted goods with ${foe}`,
    `${foe} invite ${party} to their encampment`,
    `${party} help ${foe} gather firewood`,
    `${foe} show ${party} a shortcut through the wilds`,
    `${party} band together with ${foe} against a common threat`,
    `${foe} teach ${party} a useful survival skill`,
    `${party} share songs and tales around the campfire`,
    `${foe} provide shelter from the weather`,
    `${party} aid injured ${foe} with healing herbs`,
  ];

  const CAUTIOUS_SUMMARIES = [
    `${party} observe ${foe} from a distance`,
    `${party} skirt around wary ${foe}`,
    `${foe} shadow ${party} but keep their distance`,
    `Tense standoff between ${party} and ${foe}`,
    `${party} watch ${foe} warily from cover`,
    `${foe} eye ${party} suspiciously`,
    `${party} keep their distance from armed ${foe}`,
    `${foe} block the path but allow passage`,
    `${party} signal peaceful intentions to ${foe}`,
    `${foe} demand tolls from passing ${party}`,
    `${party} detour to avoid ${foe}'s territory`,
    `${foe} follow ${party} at a safe distance`,
    `${party} prepare defenses against potential ${foe} attack`,
    `${foe} display weapons as a warning`,
    `${party} offer small gifts to appease ${foe}`,
    `${foe} test ${party}'s resolve with challenges`,
    `${party} hide their valuables from view`,
    `${foe} communicate through gestures and signs`,
    `${party} move slowly to avoid alarming ${foe}`,
    `${foe} mark their territory with warning signs`,
  ];

  const HOSTILE_SUMMARIES = [
    `${party} clash with ${foe}`,
    `${foe} ambush ${party}`,
    `Battle joined between ${party} and ${foe}`,
    `${party} face ${foe} in deadly combat`,
    `${foe} attack ${party} without warning`,
    `${party} defend against ${foe} assault`,
    `${foe} charge ${party} with weapons drawn`,
    `${party} battle ${foe} for control of the path`,
    `${foe} surround ${party} in a coordinated attack`,
    `${party} repel ${foe} raiding party`,
    `${foe} launch arrows at ${party} from hiding`,
    `${party} counterattack ${foe} invaders`,
    `${foe} poison ${party}'s water supply`,
    `${party} hunt down marauding ${foe}`,
    `${foe} set traps for unwary ${party}`,
    `${party} storm ${foe}'s stronghold`,
    `${foe} burn ${party}'s supplies`,
    `${party} duel ${foe} champions`,
    `${foe} blockade ${party}'s route`,
    `${party} siege ${foe}'s encampment`,
  ];

  const VICTORY_DETAILS = [
    'Steel rang and blood was spilled, but they prevailed.',
    'The fight was brief and brutal. The survivors withdrew.',
    'With discipline and fury, the foe was broken.',
    'Blades flashed in the uncertain light. When it ended, the way was clear.',
    'Though wounds were taken, the day was won.',
    'Their tactics turned the tide against overwhelming odds.',
    'The foe fought bravely but could not withstand the onslaught.',
    'A decisive strike ended the conflict before it could escalate.',
    'They stood their ground against the charging enemy.',
    'Superior positioning gave them the advantage they needed.',
    'The foe\'s formation broke under relentless pressure.',
    'Magic and steel combined to turn certain defeat into victory.',
    'They exploited a momentary weakness in the enemy line.',
    'Courage and quick thinking saved the day.',
    'The battle raged fiercely, but their resolve never wavered.',
    'They fought like cornered lions, driving back the attackers.',
    'A well-timed feint created the opening they needed.',
    'The foe\'s weapons glanced off enchanted armor.',
    'They pressed their advantage until the enemy fled.',
    'Victory came at great cost, but the path was secured.',
  ];

  const DEFEAT_DETAILS = [
    'They were driven back, leaving the field to their enemies.',
    'A bitter retreat, carrying wounded through the darkness.',
    'The rout was complete. They would not soon forget this day.',
    'Blood and humiliation marked the aftermath.',
    'The enemy pressed their advantage relentlessly.',
    'Overwhelming numbers told against them.',
    'A critical mistake opened the door to disaster.',
    'They fought valiantly but were simply outmatched.',
    'The foe\'s ferocity was beyond anything they had expected.',
    'Bad luck and poor positioning sealed their fate.',
    'They stood their ground as long as they could.',
    'The battle turned against them with terrifying speed.',
    'Injuries and fatigue took their toll.',
    'The enemy\'s tactics were simply too clever.',
    'They retreated in good order, preserving what they could.',
    'The cost of victory was too high for their foe to pursue.',
    'A momentary lapse led to catastrophic consequences.',
    'They learned a hard lesson about underestimating enemies.',
    'The terrain worked against them from the beginning.',
    'Fate smiled upon their enemies this day.',
  ];

  const NEGOTIATION_DETAILS = [
    'Words proved mightier than steel on this occasion.',
    'Coin changed hands. Honor was satisfied, barely.',
    'An uneasy bargain was struck beneath wary eyes.',
    'Neither side wished to die today. Terms were agreed.',
    'Diplomacy prevailed where force might have failed.',
    'They reached an accommodation that served both sides.',
    'A compromise was hammered out after tense negotiations.',
    'They found common ground in their mutual interests.',
    'The exchange of gifts sealed the temporary truce.',
    'Cultural misunderstandings were resolved through patience.',
    'They traded information as valuable as gold.',
    'A non-aggression pact was established.',
    'They agreed to respect each other\'s territories.',
    'The meeting ended with mutual respect, if not friendship.',
    'They parted as wary allies rather than bitter enemies.',
    'A hostage exchange ensured good behavior.',
    'They established rules for future encounters.',
    'The negotiation revealed unexpected shared values.',
    'Both sides gained knowledge that might prove useful.',
    'They left the meeting with hope for peaceful coexistence.',
  ];

  const FLIGHT_DETAILS = [
    'They ran. There was no shame in it—only survival.',
    'Discretion proved the better part of valor.',
    'A fighting withdrawal, but a withdrawal nonetheless.',
    'Sometimes wisdom is knowing when to flee.',
    'They withdrew to fight another day.',
    'Strategic retreat preserved their strength.',
    'The odds were insurmountable; they chose life over glory.',
    'They faded into the wilderness, leaving no trail.',
    'A tactical withdrawal under covering fire.',
    'They vanished into the shadows before the enemy could react.',
    'Preserving their lives was the wiser course.',
    'They retreated with honor intact.',
    'The battle was lost, but the war continued.',
    'They slipped away while the enemy celebrated prematurely.',
    'A calculated withdrawal to more favorable ground.',
    'They left the field but not their dignity.',
    'Survival trumped victory in this encounter.',
    'They retreated in good order, minimizing losses.',
    'The enemy\'s numbers forced a strategic withdrawal.',
    'They lived to fight—and win—another battle.',
  ];

  let summary: string;
  let detailPool: string[];

  switch (reaction) {
    case 'friendly':
      summary = rng.pick(FRIENDLY_SUMMARIES);
      detailPool = NEGOTIATION_DETAILS;
      break;
    case 'cautious':
      summary = rng.pick(CAUTIOUS_SUMMARIES);
      detailPool = outcome === 'flight' ? FLIGHT_DETAILS : NEGOTIATION_DETAILS;
      break;
    case 'hostile':
    default:
      summary = rng.pick(HOSTILE_SUMMARIES);
      detailPool =
        outcome === 'victory'
          ? VICTORY_DETAILS
          : outcome === 'defeat'
          ? DEFEAT_DETAILS
          : outcome === 'flight'
          ? FLIGHT_DETAILS
          : NEGOTIATION_DETAILS;
  }

  // Add atmospheric detail sometimes
  let details = rng.pick(detailPool);
  if (rng.chance(0.3)) {
    details += ` ${capitalize(rng.pick(atmos.sights))} marked the scene.`;
  }

  return { summary, details };
}

// Arrival scenes - more interesting than "they find an inn"
export function arrivalScene(
  rng: Random,
  party: Party,
  settlement: Settlement,
  worldTime: Date,
): { summary: string; details: string } {
  const hour = worldTime.getUTCHours();
  const phase = getTimeOfDayPhase(hour);
  const vibes = SETTLEMENT_VIBES[settlement.type];

  const SUMMARIES = [
    `${party.name} reach the gates of ${settlement.name}`,
    `${party.name} arrive at ${settlement.name}`,
    `The towers of ${settlement.name} greet ${party.name}`,
    `${party.name} enter ${settlement.name}`,
  ];

  const ARRIVAL_DETAILS: Record<ReturnType<typeof getTimeOfDayPhase>, string[]> = {
    dawn: [
      'The watch opened the gates with bleary eyes.',
      'They were among the first through the gates that day.',
      'Farmwives were already heading to market as they entered.',
    ],
    morning: [
      'The streets bustled with morning commerce.',
      "A crier announced their arrival—or perhaps the day's fish prices.",
      'Children ran alongside, begging for tales of the road.',
    ],
    midday: [
      'The inn was full of travelers escaping the noon heat.',
      'They found a bench in the shade of the town well.',
      'Market stalls offered overpriced water and underripe fruit.',
    ],
    afternoon: [
      'Guild workers were returning to their labors after the midday meal.',
      'A constable gave them a long look but said nothing.',
      'They made for the nearest inn with rooms to let.',
    ],
    dusk: [
      'Lamplighters were about their work as they passed through the gates.',
      'The smell of cooking drew them to a promising tavern.',
      'Shutters were being closed against the coming dark.',
    ],
    evening: [
      'The taverns were already full and raucous.',
      'They secured rooms before the last were taken.',
      'Music and laughter spilled from open doorways.',
    ],
    night: [
      'The gates were barely opened for their late arrival.',
      'Only the night watch saw them pass into the sleeping town.',
      'The innkeeper grumbled but found them beds.',
    ],
    'deep-night': [
      'They bribed the watch to open the postern gate.',
      'Only desperate travelers moved at such an hour.',
      'The inn was dark; they slept in the stable.',
    ],
  };

  const wounded = party.wounded ? ' The wounded needed tending. ' : '';
  const famous = (party.fame ?? 0) >= 5 ? `Word of ${party.name} had preceded them. ` : '';

  return {
    summary: rng.pick(SUMMARIES),
    details: `${rng.pick(ARRIVAL_DETAILS[phase])}${wounded}${famous}${rng.pick(vibes.bustle) ?? ''}`,
  };
}

// Departure scenes
export function departureScene(
  rng: Random,
  party: Party,
  origin: string,
  destination: string,
  terrain: Terrain,
  distance: number,
  worldTime: Date,
): { summary: string; details: string } {
  const atmos = TERRAIN_ATMOSPHERE[terrain];
  const hour = worldTime.getUTCHours();
  const phase = getTimeOfDayPhase(hour);

  const SUMMARIES = [
    `${party.name} set out from ${origin}`,
    `${party.name} take the ${terrain} road toward ${destination}`,
    `${party.name} depart ${origin} heading for ${destination}`,
    `With supplies secured, ${party.name} leave ${origin}`,
  ];

  const MOOD_DETAILS = [
    `The way ahead promised ${Math.round(distance)} miles of ${terrain}.`,
    `${capitalize(rng.pick(atmos.sights))} awaited on the path to ${destination}.`,
    `They would not reach ${destination} before ${distance > 20 ? 'nightfall' : 'the day was much older'}.`,
    `Rumors of ${rng.pick(['bandits', 'beasts', 'ill weather', 'good fortune'])} accompanied their departure.`,
  ];

  return {
    summary: rng.pick(SUMMARIES),
    details: rng.pick(MOOD_DETAILS),
  };
}

// Market/town beat - replaces boring "market murmurs"
export function marketBeat(
  rng: Random,
  settlement: Settlement,
  worldTime: Date,
  notable?: { npcs?: NPC[]; parties?: Party[]; tension?: number },
): { summary: string; details: string } | null {
  // Reduce frequency of generic market updates
  if (!notable?.npcs?.length && !notable?.parties?.length && rng.chance(0.7)) {
    return null; // Skip most generic beats
  }

  const hour = worldTime.getUTCHours();
  const phase = getTimeOfDayPhase(hour);

  // Market is closed at night
  if (phase === 'night' || phase === 'deep-night') return null;

  const vibes = SETTLEMENT_VIBES[settlement.type];
  const tension = notable?.tension ?? settlement.mood;

  const MARKET_SUMMARIES: Record<string, string[]> = {
    low_tension: [
      `Fair weather and fair dealing in ${settlement.name}`,
      `${settlement.name} enjoys prosperous trade`,
      `Peace reigns in the markets of ${settlement.name}`,
    ],
    normal: [
      `Commerce flows through ${settlement.name}`,
      `The usual business in ${settlement.name}`,
      `${settlement.name} sees steady trade`,
    ],
    high_tension: [
      `Unrest simmers in ${settlement.name}`,
      `Tensions run high in ${settlement.name}'s streets`,
      `Trouble brewing in ${settlement.name}`,
    ],
  };

  const tensionKey = tension >= 2 ? 'high_tension' : tension <= -2 ? 'low_tension' : 'normal';
  let summary = rng.pick(MARKET_SUMMARIES[tensionKey]);

  // Add notable NPCs/parties
  let details = rng.pick(vibes.bustle);
  if (notable?.npcs?.length) {
    const npc = notable.npcs[0];
    details += ` ${npc.name} the ${npc.role} was seen about town.`;
  }
  if (notable?.parties?.length) {
    const p = notable.parties[0];
    if ((p.fame ?? 0) >= 3) {
      details += ` Folk whispered of ${p.name}'s exploits.`;
    }
  }

  return { summary, details };
}

// Weather narratives - more evocative
export function weatherNarrative(
  rng: Random,
  settlement: Settlement,
  conditions: 'clear' | 'cloudy' | 'rain' | 'storm' | 'snow' | 'fog',
  worldTime: Date,
): { summary: string; details: string } {
  const WEATHER_NARRATIVES: Record<typeof conditions, { summaries: string[]; details: string[] }> = {
    clear: {
      summaries: [
        `Blue skies over ${settlement.name}`,
        `Fair weather blesses ${settlement.name}`,
        `The sun shines upon ${settlement.name}`,
      ],
      details: [
        'Perfect conditions for travel and trade.',
        'Not a cloud marred the heavens.',
        'Farmers gave thanks for the gentle weather.',
      ],
    },
    cloudy: {
      summaries: [
        `Clouds gather over ${settlement.name}`,
        `Grey skies hang over ${settlement.name}`,
        `Overcast weather at ${settlement.name}`,
      ],
      details: [
        'Whether rain would follow, none could say.',
        'The mood matched the dull sky.',
        'Old wounds ached with the change in pressure.',
      ],
    },
    rain: {
      summaries: [
        `Rain falls on ${settlement.name}`,
        `${settlement.name} weathers a downpour`,
        `The heavens open over ${settlement.name}`,
      ],
      details: [
        'The streets emptied as folk sought shelter.',
        'Merchants cursed as goods needed covering.',
        'Children splashed in growing puddles.',
      ],
    },
    storm: {
      summaries: [
        `Storm lashes ${settlement.name}`,
        `Thunder rolls over ${settlement.name}`,
        `Tempest strikes ${settlement.name}`,
      ],
      details: [
        'Shutters slammed and animals huddled in barns.',
        'Lightning illuminated the darkened streets.',
        'The old folk said such storms brought change.',
      ],
    },
    snow: {
      summaries: [
        `Snow blankets ${settlement.name}`,
        `Winter's grip tightens on ${settlement.name}`,
        `${settlement.name} wakes to fresh snowfall`,
      ],
      details: [
        'Sounds were muffled under the white covering.',
        'The cold drove all but the hardiest indoors.',
        'Children made sport while adults worried over firewood.',
      ],
    },
    fog: {
      summaries: [
        `Fog shrouds ${settlement.name}`,
        `Mist rolls through ${settlement.name}`,
        `${settlement.name} vanishes into fog`,
      ],
      details: [
        'Shapes loomed and vanished in the murk.',
        'Sound carried strangely in the thick air.',
        'The watch doubled their patrols, seeing danger in every shadow.',
      ],
    },
  };

  const weather = WEATHER_NARRATIVES[conditions];
  return {
    summary: rng.pick(weather.summaries),
    details: rng.pick(weather.details),
  };
}

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export { capitalize };

