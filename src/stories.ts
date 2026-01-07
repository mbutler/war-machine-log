/**
 * EMERGENT STORY THREAD SYSTEM
 * 
 * Story threads are ongoing narratives that emerge from simulation events.
 * They track:
 * - Quest-like objectives that arise naturally
 * - Multi-party conflicts and their progression
 * - Mysteries that unfold over time
 * - Character arcs for NPCs and parties
 * 
 * Unlike scripted quests, these emerge entirely from gameplay and
 * can resolve in multiple ways based on what happens.
 */

import { Random } from './rng.ts';
import { WorldState, LogEntry, Party, NPC, Settlement, Faction } from './types.ts';
import { Antagonist } from './antagonists.ts';
import { queueConsequence } from './consequences.ts';
import { randomName } from './naming.ts';

// Story progression beats - moved to module scope for access by multiple functions
const PROGRESSION_BEATS: Record<StoryType, string[]> = {
  // CONFLICT
  hunt: [
    'Tracks are found. The quarry draws near.',
    'A witness points the way.',
    'The hunter\'s patience wears thin.',
    'The quarry leaves a taunt. It\'s personal now.',
    'The hunt leads through treacherous terrain.',
    'Allies offer aid, but at a steep price.',
    'The quarry seems to anticipate every move.',
    'A storm hampers the pursuit.',
    'Local villagers share rumors of the prey.',
    'The hunters discover they are not alone in the chase.',
    'Supplies dwindle; the hunt becomes desperate.',
    'The quarry turns the tables, becoming the hunter.',
    'Ancient ruins hold clues to the prey\'s location.',
    'A bounty is placed, attracting more hunters.',
    'The chase crosses into forbidden territory.',
  ],
  feud: [
    'Harsh words are exchanged publicly.',
    'An ally is subverted.',
    'Blood is spilled in a back alley.',
    'Neutral parties are forced to choose sides.',
    'A peace offering is rejected with scorn.',
    'Rumors of assassination attempts spread.',
    'Economic pressure is applied through boycotts.',
    'Marriage alliances are proposed to end the feud.',
    'A third party profits from the conflict.',
    'Religious leaders attempt mediation.',
    'The feud spreads to younger generations.',
    'Property is vandalized in the night.',
    'Legal battles drain both sides\' resources.',
    'Mercenaries are hired for dirty work.',
    'A beloved figure is caught in the crossfire.',
  ],
  revenge: [
    'The avenger moves closer.',
    'Old alliances are tested.',
    'The weight of vengeance grows heavier.',
    'The target learns they are being hunted.',
    'Friends warn the avenger to stop.',
    'The target hires bodyguards.',
    'A weapon is forged for the final confrontation.',
    'The avenger trains relentlessly.',
    'Memories of the original wrong fuel the fire.',
    'The target flees to a distant land.',
    'Allies of the target are threatened.',
    'The avenger infiltrates the target\'s inner circle.',
    'A bounty is placed on the avenger.',
    'The original crime\'s details emerge.',
    'The avenger questions their own motives.',
  ],
  war: [
    'Skirmishes break out along the border.',
    'Diplomatic options narrow.',
    'The drums beat louder.',
    'Mercenaries arrive, choosing sides.',
    'Fortifications are hastily constructed.',
    'Spies infiltrate enemy territory.',
    'Supply lines are disrupted.',
    'Deserters tell tales of enemy weakness.',
    'Religious figures bless the troops.',
    'A famous commander takes the field.',
    'Siege engines are brought forward.',
    'Naval blockades are established.',
    'Refugees flee the war zone.',
    'Neutral territories are invaded.',
    'Peace negotiations are attempted and fail.',
  ],
  siege: [
    'Supplies inside the walls dwindle.',
    'A sortie attempts to break the ring.',
    'Disease spreads among the besieged.',
    'Siege engines are brought into position.',
    'Miners tunnel under the walls.',
    'Catapults hurl flaming projectiles.',
    'Defenders sally forth at night.',
    'Psychological warfare begins.',
    'Reinforcements arrive for the attackers.',
    'The besieged attempt to smuggle messages out.',
    'Water sources are poisoned or diverted.',
    'Religious ceremonies bolster morale.',
    'A famous hero leads the defense.',
    'Weather hampers siege operations.',
    'Negotiations occur under a flag of truce.',
  ],
  rebellion: [
    'Another village joins the uprising.',
    'The authorities respond with force.',
    'A charismatic leader emerges.',
    'Nobles flee the region.',
    'Secret meetings are held in hidden places.',
    'Propaganda leaflets circulate.',
    'Taxes are refused, leading to conflict.',
    'Armories are raided for weapons.',
    'Foreign powers offer support.',
    'The rebels establish their own courts.',
    'Loyalists organize counter-rebellions.',
    'Religious leaders take sides.',
    'Trade is disrupted by blockades.',
    'Prisoners are taken and ransomed.',
    'The rebellion spreads to neighboring regions.',
  ],
  duel: [
    'Seconds negotiate the terms.',
    'One party attempts reconciliation.',
    'Rumors spread about the coming fight.',
    'Spectators gather to witness.',
    'The chosen weapons are prepared.',
    'The location is scouted and agreed upon.',
    'Wagers are placed on the outcome.',
    'Family members attempt intervention.',
    'Medical aid is arranged.',
    'The duel is delayed by weather or omens.',
    'One combatant trains intensely.',
    'Honor codes are debated.',
    'A poet composes verses about the duel.',
    'Political implications are discussed.',
    'The duel becomes a matter of public interest.',
  ],
  raid: [
    'Scouts report enemy movements.',
    'Defenses are hastily reinforced.',
    'Fires on the horizon approach.',
    'Refugees flee ahead of the raiders.',
    'Livestock is driven off in the night.',
    'Ambushes are set along expected routes.',
    'Raiders demand tribute to spare settlements.',
    'Prisoners are taken for ransom.',
    'War cries echo through the valleys.',
    'Smoke signals warn of the advance.',
    'Villagers hide their valuables.',
    'The raiders employ guerrilla tactics.',
    'Local heroes organize resistance.',
    'The raid escalates into open warfare.',
    'Survivors tell tales of the attackers.',
  ],

  // DISCOVERY
  mystery: [
    'A new clue surfaces.',
    'Someone who knew too much falls silent.',
    'The pattern becomes clearer—and more disturbing.',
    'An old document reveals a connection.',
    'Witnesses contradict each other.',
    'Strange symbols appear in unexpected places.',
    'Dreams plague those investigating.',
    'Ancient ruins yield cryptic messages.',
    'A suspect is cleared, pointing elsewhere.',
    'The mystery seems connected to ancient legends.',
    'False leads waste valuable time.',
    'A trusted ally is revealed as unreliable.',
    'The investigators receive anonymous warnings.',
    'The mystery touches personal lives.',
    'Time pressure mounts as events accelerate.',
  ],
  treasure: [
    'A rival expedition sets out.',
    'The map proves partially false.',
    'Greed begins to poison the company.',
    'Guardians of the treasure awaken.',
    'Supplies are lost to bandits or weather.',
    'Team members desert with portions of the map.',
    'Ancient traps claim lives.',
    'The treasure proves to be cursed.',
    'Local legends prove partially true.',
    'The expedition splits over strategy.',
    'A guide betrays the group.',
    'The treasure hoard proves disappointingly small.',
    'Magical wards must be overcome.',
    'The treasure attracts monstrous attention.',
    'Political complications arise.',
  ],
  prophecy: [
    'Another sign manifests.',
    'Believers grow in number.',
    'The skeptics fall silent.',
    'Those who would prevent the prophecy act.',
    'Interpretations of the prophecy conflict.',
    'A false prophet emerges.',
    'Sacred texts are rediscovered.',
    'Miracles are attributed to the prophecy.',
    'Skeptics are converted by events.',
    'The prophesied figure remains hidden.',
    'Political factions align around interpretations.',
    'Ancient artifacts confirm the prophecy.',
    'The prophesied events begin small.',
    'Opponents attempt to forge counter-prophecies.',
    'The prophecy affects daily life.',
  ],
  expedition: [
    'The terrain becomes impassable.',
    'Strange landmarks appear as described.',
    'Supplies run dangerously low.',
    'Contact with home is lost.',
    'The expedition encounters hostile natives.',
    'Disease strikes the explorers.',
    'Weather turns against the group.',
    'Internal conflicts emerge.',
    'Amazing discoveries are made.',
    'The expedition must turn back.',
    'A mutiny threatens the leadership.',
    'The goal proves farther than expected.',
    'Valuable trade opportunities appear.',
    'The expedition inspires future explorers.',
    'Tragedy strikes the group.',
  ],
  artifact: [
    'A fragment of the artifact is found.',
    'Another seeker enters the race.',
    'The artifact\'s location is narrowed down.',
    'Visions reveal the artifact\'s power.',
    'The artifact begins to influence seekers.',
    'Ancient guardians oppose the search.',
    'False artifacts mislead seekers.',
    'The artifact chooses its own path.',
    'Political powers become involved.',
    'The artifact proves sentient.',
    'Time pressure mounts.',
    'The search reveals other secrets.',
    'Betrayals occur among seekers.',
    'The artifact\'s true nature emerges.',
    'Unintended consequences appear.',
  ],
  'lost-heir': [
    'Evidence of the bloodline surfaces.',
    'Enemies of the heir move to suppress the claim.',
    'The heir learns fragments of their history.',
    'Old servants remember the true lineage.',
    'The heir proves their claim.',
    'Imposters emerge to challenge the claim.',
    'The heir must prove their worth.',
    'Ancient secrets are revealed.',
    'Political alliances shift.',
    'The heir faces assassination attempts.',
    'Family members have divided loyalties.',
    'The throne proves contested.',
    'The heir discovers hidden talents.',
    'The past catches up with the family.',
    'Loyal supporters rally to the cause.',
  ],
  'ancient-evil': [
    'Tremors shake the earth.',
    'Animals flee the area.',
    'The seals show signs of weakening.',
    'Dreams of darkness plague the populace.',
    'Strange creatures appear at night.',
    'Ancient runes glow with power.',
    'The ground becomes unstable.',
    'Local wildlife behaves erratically.',
    'Old artifacts reactivate.',
    'Scholars debate the signs.',
    'The evil sends visions to the weak.',
    'Guardians of the seal grow restless.',
    'Time seems to distort near the site.',
    'The evil influences local politics.',
    'Heroes are drawn to confront it.',
  ],
  portal: [
    'Strange creatures emerge.',
    'The portal fluctuates in stability.',
    'Communication across the threshold begins.',
    'The other side sends an emissary.',
    'Energy signatures change.',
    'Local magic becomes unreliable.',
    'Time flows differently near the portal.',
    'Strange materials appear.',
    'The portal attracts scholars.',
    'Monsters from beyond appear.',
    'The portal begins to expand.',
    'Communication becomes clearer.',
    'Trade through the portal begins.',
    'The other side requests aid.',
    'The portal threatens to become permanent.',
  ],

  // SOCIAL
  romance: [
    'A secret meeting is arranged.',
    'Jealousy rears its head.',
    'Families object to the union.',
    'A rival for affection appears.',
    'Love letters are exchanged.',
    'A romantic gesture goes wrong.',
    'Family secrets complicate matters.',
    'Social expectations create tension.',
    'A scandal threatens the relationship.',
    'Long separations test their bond.',
    'Cultural differences emerge.',
    'Friends offer conflicting advice.',
    'A grand romantic gesture is planned.',
    'Misunderstandings create drama.',
    'True feelings are finally revealed.',
  ],
  rise: [
    'Another triumph adds to the legend.',
    'Enemies begin to take notice.',
    'The price of success becomes apparent.',
    'Old allies are left behind.',
    'New opportunities present themselves.',
    'Rivals attempt to undermine success.',
    'The rising figure inspires others.',
    'Power brings unexpected responsibilities.',
    'Jealousy affects old relationships.',
    'Success attracts dangerous attention.',
    'The figure questions their ambitions.',
    'Mentors offer guidance.',
    'New allies seek association.',
    'The path becomes more dangerous.',
    'Success brings moral dilemmas.',
  ],
  fall: [
    'Another supporter abandons ship.',
    'Debts come due.',
    'The vultures circle lower.',
    'Former rivals offer hollow sympathy.',
    'Mistakes from the past resurface.',
    'Allies prove unreliable.',
    'The fall happens gradually.',
    'Public opinion turns.',
    'Internal conflicts weaken resolve.',
    'Opportunities for redemption appear.',
    'The fallen figure loses confidence.',
    'Old enemies take advantage.',
    'Supporters dwindle.',
    'The fall becomes inevitable.',
    'Rock bottom offers new perspective.',
  ],
  scandal: [
    'Whispers become open conversation.',
    'Evidence surfaces—real or fabricated.',
    'Allies distance themselves.',
    'Public condemnation begins.',
    'The accused denies everything.',
    'Investigations are launched.',
    'Media attention grows.',
    'Friends are forced to choose sides.',
    'The scandal affects innocent bystanders.',
    'Damage control efforts begin.',
    'The truth becomes obscured.',
    'Political implications emerge.',
    'Legal battles ensue.',
    'The scandal spreads to others.',
    'Time reveals the full story.',
  ],
  betrayal: [
    'Small inconsistencies are noticed.',
    'The betrayer grows bolder.',
    'Suspicion falls on the wrong person.',
    'The moment of truth approaches.',
    'Evidence begins to accumulate.',
    'The betrayed feels growing unease.',
    'Allies offer conflicting information.',
    'The betrayal affects multiple people.',
    'Confrontation becomes inevitable.',
    'The betrayer\'s motives emerge.',
    'Collateral damage occurs.',
    'Trust is shattered.',
    'Reconciliation seems impossible.',
    'The betrayal changes everything.',
    'Lessons are learned too late.',
  ],
  succession: [
    'Alliances form behind each claimant.',
    'Legal scholars debate legitimacy.',
    'Gold changes hands to buy support.',
    'Assassination attempts multiply.',
    'Public opinion sways.',
    'Ancient laws are consulted.',
    'Foreign powers become involved.',
    'The claimants campaign actively.',
    'Scandals affect various candidates.',
    'Military support is courted.',
    'Religious approval is sought.',
    'The succession becomes contested.',
    'Compromises are proposed.',
    'Violence breaks out.',
    'A winner finally emerges.',
  ],
  exile: [
    'The exile finds temporary shelter.',
    'Messages from home bring mixed news.',
    'The exile\'s skills prove valuable abroad.',
    'Plots to return home form.',
    'The exile adapts to new surroundings.',
    'Old enemies pursue relentlessly.',
    'New allies are found.',
    'The exile learns valuable lessons.',
    'Home seems both distant and alluring.',
    'Time softens the pain of exile.',
    'The exile builds a new life.',
    'Calls for return grow louder.',
    'The exile faces temptation.',
    'Old wounds are reopened.',
    'The exile finds inner peace.',
  ],
  redemption: [
    'A small act of kindness is noted.',
    'Old victims are confronted.',
    'The path proves harder than expected.',
    'A test of true change arrives.',
    'Progress is made slowly.',
    'Skeptics remain unconvinced.',
    'New opportunities emerge.',
    'The redeemed faces temptation.',
    'Allies offer support.',
    'Old habits prove hard to break.',
    'Public opinion shifts gradually.',
    'The redeemed proves their sincerity.',
    'Forgiveness is granted.',
    'A new chapter begins.',
    'True redemption is achieved.',
  ],

  // SURVIVAL
  rescue: [
    'A ransom demand arrives.',
    'A rescue attempt fails.',
    'Hope dwindles with each passing day.',
    'The captive sends a secret message.',
    'Rescuers gather resources.',
    'The captors grow impatient.',
    'Negotiations begin.',
    'Time runs short.',
    'A rescue plan is formulated.',
    'Unexpected complications arise.',
    'The captive\'s condition deteriorates.',
    'Allies provide crucial aid.',
    'The rescue becomes desperate.',
    'Success seems within reach.',
    'The outcome hangs in balance.',
  ],
  plague: [
    'The sickness spreads.',
    'A cure is rumored.',
    'Quarantines prove inadequate.',
    'The source of the plague is suspected.',
    'Symptoms become more severe.',
    'Healers work tirelessly.',
    'Fear grips the population.',
    'Quack cures proliferate.',
    'The plague affects the powerful.',
    'Scientific investigation begins.',
    'Traditional remedies are tried.',
    'The plague changes society.',
    'Heroes emerge.',
    'The source is finally identified.',
    'Recovery begins.',
  ],
  famine: [
    'Rations are cut again.',
    'Hoarding is punished severely.',
    'The desperate turn to crime.',
    'Relief supplies are diverted.',
    'The famine affects the powerful.',
    'Migration begins.',
    'Social order breaks down.',
    'Aid arrives from unexpected sources.',
    'The famine changes society.',
    'Innovation solves problems.',
    'The famine ends gradually.',
    'Scars remain.',
    'Lessons are learned.',
    'Society rebuilds stronger.',
    'Memory fades with time.',
  ],
  migration: [
    'The column stretches for miles.',
    'Local populations react with fear.',
    'Resources along the route are exhausted.',
    'Splinter groups break away.',
    'The migrants face hostility.',
    'New lands prove challenging.',
    'Cultural clashes occur.',
    'The migration changes everyone.',
    'Adaptation proves difficult.',
    'New communities form.',
    'The journey tests resolve.',
    'Unexpected allies appear.',
    'The migrants reach their goal.',
    'Integration begins.',
    'A new chapter opens.',
  ],
  sanctuary: [
    'The defenses are tested.',
    'Supplies begin to run low.',
    'Tension rises between refugees.',
    'A spy is suspected within.',
    'The sanctuary proves inadequate.',
    'External threats grow.',
    'Internal conflicts emerge.',
    'Resources are rationed.',
    'The sanctuary becomes overcrowded.',
    'Leadership is challenged.',
    'Allies provide support.',
    'The sanctuary holds.',
    'Compromises are made.',
    'Growth occurs.',
    'The sanctuary evolves.',
  ],
  curse: [
    'The curse begins to manifest.',
    'Victims seek relief.',
    'The curse affects the innocent.',
    'Ancient knowledge is consulted.',
    'The curse spreads.',
    'Heroes investigate.',
    'The source is revealed.',
    'Breaking the curse proves difficult.',
    'Sacrifices are made.',
    'The curse changes everything.',
    'Hope emerges.',
    'The curse is broken.',
    'Consequences remain.',
    'Lessons are learned.',
    'Healing begins.',
  ],
  'hunt-survival': [
    'The hunted evades capture.',
    'Pursuers close in.',
    'The hunted finds temporary refuge.',
    'The chase becomes personal.',
    'Allies aid the hunted.',
    'The hunted turns the tables.',
    'Time runs short.',
    'The hunted faces despair.',
    'Unexpected help arrives.',
    'The hunted proves resourceful.',
    'The chase ends.',
    'Consequences follow.',
    'The hunted survives.',
    'New threats emerge.',
    'The story continues.',
  ],

  // INTRIGUE
  conspiracy: [
    'Whispers spread in dark corners.',
    'Allies prove unreliable.',
    'The conspiracy grows.',
    'Evidence is planted.',
    'Doubts emerge.',
    'The conspiracy succeeds.',
    'Exposure threatens.',
    'Internal conflicts arise.',
    'The conspiracy evolves.',
    'Truth emerges.',
    'Consequences follow.',
    'Justice is served.',
    'The conspiracy ends.',
    'Lessons are learned.',
    'Society changes.',
  ],
  heist: [
    'Planning intensifies.',
    'Team members are recruited.',
    'Security is studied.',
    'Complications arise.',
    'The plan changes.',
    'Execution begins.',
    'Unexpected obstacles appear.',
    'Tension builds.',
    'Success seems possible.',
    'Betrayal threatens.',
    'The heist proceeds.',
    'Consequences emerge.',
    'The outcome is decided.',
    'Aftermath follows.',
    'New opportunities arise.',
  ],
  infiltration: [
    'The infiltrator gains access.',
    'Trust is established.',
    'Information is gathered.',
    'Suspicion grows.',
    'The infiltrator acts.',
    'Discovery threatens.',
    'The mission succeeds.',
    'Escape becomes necessary.',
    'Consequences follow.',
    'The infiltrator reflects.',
    'New missions await.',
    'The story evolves.',
    'Allies emerge.',
    'The infiltration ends.',
    'Lessons are learned.',
  ],
  blackmail: [
    'Secrets are discovered.',
    'Demands are made.',
    'Victims react.',
    'The blackmailer acts.',
    'Resistance grows.',
    'Consequences emerge.',
    'The blackmail succeeds.',
    'Exposure threatens.',
    'The blackmailer reflects.',
    'New opportunities arise.',
    'The story continues.',
    'Allies emerge.',
    'The blackmail ends.',
    'Lessons are learned.',
    'Society changes.',
  ],
  imposter: [
    'The deception begins.',
    'Trust is gained.',
    'The imposter acts.',
    'Suspicion emerges.',
    'The deception deepens.',
    'Discovery threatens.',
    'The imposter succeeds.',
    'Exposure occurs.',
    'Consequences follow.',
    'The imposter reflects.',
    'New identities await.',
    'The story evolves.',
    'Allies emerge.',
    'The deception ends.',
    'Lessons are learned.',
  ],
  cult: [
    'The cult grows.',
    'Rituals are performed.',
    'Converts join.',
    'Opposition emerges.',
    'The cult acts.',
    'Internal conflicts arise.',
    'The cult succeeds.',
    'Exposure threatens.',
    'The cult reflects.',
    'New followers await.',
    'The story evolves.',
    'Allies emerge.',
    'The cult ends.',
    'Lessons are learned.',
    'Society changes.',
  ],

  // SUPERNATURAL
  haunting: [
    'Manifestations increase.',
    'The haunted seek help.',
    'The haunting affects the living.',
    'Investigations begin.',
    'The source is revealed.',
    'The haunting intensifies.',
    'Resolution approaches.',
    'The haunting ends.',
    'Consequences remain.',
    'Lessons are learned.',
    'The story continues.',
    'New hauntings begin.',
    'The haunted reflect.',
    'Allies emerge.',
    'Peace returns.',
  ],
  possession: [
    'Changes become noticeable.',
    'The possessed acts strangely.',
    'Loved ones react.',
    'Exorcism is attempted.',
    'The possession deepens.',
    'Control slips.',
    'Resolution approaches.',
    'The possession ends.',
    'Consequences remain.',
    'Lessons are learned.',
    'The possessed reflects.',
    'Allies emerge.',
    'New possessions begin.',
    'The story evolves.',
    'Recovery occurs.',
  ],
  transformation: [
    'Changes begin.',
    'The transformed adapts.',
    'Others react with fear.',
    'The transformation progresses.',
    'Control becomes difficult.',
    'Benefits emerge.',
    'The transformation completes.',
    'Consequences follow.',
    'The transformed reflects.',
    'Allies emerge.',
    'New transformations begin.',
    'The story evolves.',
    'Acceptance occurs.',
    'Lessons are learned.',
  ],
  pact: [
    'The pact is made.',
    'Terms are tested.',
    'Benefits emerge.',
    'Costs become apparent.',
    'The pact deepens.',
    'Regret grows.',
    'Breaking the pact proves difficult.',
    'Consequences follow.',
    'The pact-maker reflects.',
    'Allies emerge.',
    'New pacts are made.',
    'The story evolves.',
    'Redemption occurs.',
    'Lessons are learned.',
  ],
  rift: [
    'The rift opens.',
    'Reality warps.',
    'Creatures emerge.',
    'The rift expands.',
    'Control becomes difficult.',
    'Closing the rift proves hard.',
    'Consequences follow.',
    'The rift closes.',
    'Reality stabilizes.',
    'Lessons are learned.',
    'The story continues.',
    'New rifts open.',
    'Survivors reflect.',
    'Allies emerge.',
  ],
  awakening: [
    'Power manifests.',
    'The awakened adapts.',
    'Others sense the change.',
    'Control becomes difficult.',
    'The awakening progresses.',
    'Responsibilities emerge.',
    'The full awakening occurs.',
    'Consequences follow.',
    'The awakened reflects.',
    'Allies emerge.',
    'New awakenings begin.',
    'The story evolves.',
    'Mastery occurs.',
    'Lessons are learned.',
  ],
};

export type StoryType =
  // === CONFLICT STORIES ===
  | 'hunt'           // Party pursuing a threat
  | 'feud'           // Conflict between parties/factions
  | 'revenge'        // Someone seeking payback
  | 'war'            // Large-scale conflict brewing
  | 'siege'          // Prolonged military standoff
  | 'rebellion'      // Uprising against authority
  | 'duel'           // Personal combat of honor
  | 'raid'           // Quick strike and retreat
  
  // === DISCOVERY STORIES ===
  | 'mystery'        // Something to uncover
  | 'treasure'       // Wealth to be claimed
  | 'prophecy'       // Foretold events unfolding
  | 'expedition'     // Journey into the unknown
  | 'artifact'       // Legendary item sought
  | 'lost-heir'      // Hidden bloodline revealed
  | 'ancient-evil'   // Something awakens
  | 'portal'         // Gateway between worlds
  
  // === SOCIAL STORIES ===
  | 'romance'        // Love story
  | 'rise'           // Someone's ascent to power/fame
  | 'fall'           // Someone's decline
  | 'scandal'        // Reputation-destroying revelation
  | 'betrayal'       // Trust broken dramatically
  | 'succession'     // Contest for inheritance
  | 'exile'          // Someone cast out
  | 'redemption'     // Seeking forgiveness
  
  // === SURVIVAL STORIES ===
  | 'rescue'         // Someone needs saving
  | 'plague'         // Spreading disaster
  | 'famine'         // Starvation threatens
  | 'migration'      // Mass movement of people/creatures
  | 'sanctuary'      // Safe haven threatened
  | 'curse'          // Supernatural affliction
  | 'hunt-survival'  // Being hunted, not hunting
  
  // === INTRIGUE STORIES ===
  | 'conspiracy'     // Hidden plot uncovered
  | 'heist'          // Elaborate theft in progress
  | 'infiltration'   // Spy in their midst
  | 'blackmail'      // Secrets as weapons
  | 'imposter'       // Someone is not who they seem
  | 'cult'           // Secret society rising
  
  // === SUPERNATURAL STORIES ===
  | 'haunting'       // Spirits demand attention
  | 'possession'     // Something controls someone
  | 'transformation' // Someone becoming something else
  | 'pact'           // Deal with dark powers
  | 'rift'           // Reality tears open
  | 'awakening';     // Power manifests unexpectedly

export type StoryPhase =
  | 'inciting' // Just begun
  | 'rising' // Building tension
  | 'climax' // Critical moment approaching
  | 'resolution' // Wrapping up
  | 'aftermath'; // Consequences playing out

export interface StoryThread {
  id: string;
  type: StoryType;
  title: string;
  summary: string;
  phase: StoryPhase;
  actors: string[]; // Party/NPC/Faction names involved
  location: string; // Primary setting
  startedAt: Date;
  lastUpdated: Date;
  tension: number; // 0-10, how close to climax
  beats: StoryBeat[]; // Events in this story
  potentialOutcomes: string[]; // Ways this might end
  resolved: boolean;
  resolution?: string;

  // Enhanced context for richer storytelling (backwards compatible)
  context?: {
    actorRelationships?: string[]; // e.g., ["John hates Mary", "Sarah is Mary's sister"]
    keyLocations?: string[]; // Specific places mentioned in the story
    themes?: string[]; // e.g., ["revenge", "redemption", "betrayal"]
    motivations?: Record<string, string>; // Actor -> their personal stake
  };

  // Branching narrative state (backwards compatible)
  branchingState?: {
    path?: string; // Current narrative branch taken
    choices?: string[]; // Available next steps (for future AI/player choice)
    variables?: Record<string, any>; // Story-specific state
  };
}

export interface StoryBeat {
  timestamp: Date;
  summary: string;
  tensionChange: number;
}

// Story templates for generating new threads
interface StoryTemplate {
  type: StoryType;
  titles: string[];
  summaries: (actors: string[], location: string) => string[];
  outcomes: string[];
}

const STORY_TEMPLATES: StoryTemplate[] = [
  // === CONFLICT STORIES ===
  {
    type: 'hunt',
    titles: ['The Hunt for %ACTOR%', 'Tracking the %ACTOR%', '%ACTOR%\'s Last Stand', 'Blood on the Trail'],
    summaries: (actors, location) => [
      `${actors[0]} stalks ${actors[1] ?? 'a dangerous quarry'} across the region.`,
      `A deadly game of cat and mouse unfolds near ${location}.`,
      `The hunt enters its final phase. One will not survive.`,
    ],
    outcomes: [
      'The quarry is slain.',
      'The quarry escapes to parts unknown.',
      'The hunters become the hunted.',
      'An unexpected alliance forms.',
      'The quarry is captured alive—but for what purpose?',
    ],
  },
  {
    type: 'feud',
    titles: ['Blood Between %ACTOR% and %ACTOR%', 'The %LOCATION% Vendetta', 'Old Grievances', 'A House Divided'],
    summaries: (actors, location) => [
      `Bad blood between ${actors[0]} and ${actors[1] ?? 'their enemies'} threatens to spill over.`,
      `${location} becomes the stage for an escalating conflict.`,
      `Ancient grudges flare anew. Neither side will back down.`,
    ],
    outcomes: [
      'One side is destroyed utterly.',
      'A fragile peace is negotiated.',
      'Both sides are weakened; a third party profits.',
      'The feud spreads, drawing in new participants.',
      'Marriage unites the feuding parties—but for how long?',
    ],
  },
  {
    type: 'revenge',
    titles: ['%ACTOR%\'s Vengeance', 'Debts Paid in Blood', 'The Reckoning', 'Cold Revenge'],
    summaries: (actors, location) => [
      `${actors[0]} has sworn to make ${actors[1] ?? 'someone'} pay.`,
      `An old wrong demands answer. Blood will flow in ${location}.`,
      `Years of planning come to fruition. The target has no idea.`,
    ],
    outcomes: [
      'Vengeance is achieved. The avenger finds no peace.',
      'The target proves too strong. The avenger falls.',
      'Revenge begets revenge. The cycle continues.',
      'Forgiveness prevails. Both parties find closure.',
      'The wrong turns out to be a misunderstanding—too late.',
    ],
  },
  {
    type: 'war',
    titles: ['The %LOCATION% War', 'Drums of War', 'The Coming Storm', 'When Banners Fly'],
    summaries: (actors, location) => [
      `${actors[0]} and ${actors[1] ?? 'their enemies'} mass for conflict.`,
      `War clouds gather over ${location}. The common folk suffer.`,
      `Armies march. Diplomacy has failed.`,
    ],
    outcomes: [
      'One side achieves total victory.',
      'Stalemate grinds both sides down.',
      'A greater threat forces alliance.',
      'The war spreads beyond control.',
      'Mutual exhaustion leads to an uneasy truce.',
    ],
  },
  {
    type: 'siege',
    titles: ['The Siege of %LOCATION%', 'Walls of %LOCATION%', 'Starvation and Steel', 'No Relief Coming'],
    summaries: (actors, location) => [
      `${location} is encircled. Supplies dwindle.`,
      `${actors[0]} tightens the noose around ${location}.`,
      `Every day without relief, hope fades inside the walls.`,
    ],
    outcomes: [
      'The walls are breached. Slaughter follows.',
      'A relief force breaks the siege.',
      'Starvation forces surrender.',
      'A secret tunnel allows escape.',
      'Treachery opens the gates from within.',
    ],
  },
  {
    type: 'rebellion',
    titles: ['The %LOCATION% Uprising', 'Torches in the Night', 'The People Rise', 'Breaking Chains'],
    summaries: (actors, location) => [
      `The common folk of ${location} have had enough.`,
      `${actors[0]} leads the dispossessed against their masters.`,
      `What begins as protest turns to open rebellion.`,
    ],
    outcomes: [
      'The rebellion is crushed. Examples are made.',
      'The old order is swept away.',
      'Concessions buy temporary peace.',
      'The rebels win, then turn on each other.',
      'Outside powers intervene for their own ends.',
    ],
  },
  {
    type: 'duel',
    titles: ['The %LOCATION% Duel', 'Dawn and Steel', 'Honor Demands Blood', 'Seconds and Swords'],
    summaries: (actors, location) => [
      `${actors[0]} challenges ${actors[1] ?? 'a rival'} to single combat.`,
      `Honor can only be satisfied with blood. ${location} will witness.`,
    ],
    outcomes: [
      'The challenger prevails.',
      'The defender proves the stronger.',
      'Both combatants fall.',
      'Interference stops the duel—honor unsatisfied.',
      'First blood ends it; mutual respect grows.',
    ],
  },
  {
    type: 'raid',
    titles: ['Fire in %LOCATION%', 'The %ACTOR% Raid', 'Strike and Vanish', 'Burning Dawn'],
    summaries: (actors, location) => [
      `${actors[0]} strikes fast at ${location} and withdraws before retaliation.`,
      `Hit and run tactics terrorize ${location}.`,
    ],
    outcomes: [
      'The raid succeeds with heavy plunder.',
      'The raiders are intercepted and destroyed.',
      'The raid escalates into open war.',
      'The raiders demand tribute to stop.',
    ],
  },

  // === DISCOVERY STORIES ===
  {
    type: 'mystery',
    titles: ['The %LOCATION% Mystery', 'Secrets of %ACTOR%', 'What Lurks Beneath', 'Strange Happenings'],
    summaries: (actors, location) => [
      `Strange events in ${location} demand explanation.`,
      `${actors[0]} uncovers clues to something best left buried.`,
      `Every answer raises three more questions.`,
    ],
    outcomes: [
      'The truth is revealed—and it\'s worse than imagined.',
      'The mystery remains unsolved; some doors are better left closed.',
      'A hidden conspiracy is exposed.',
      'The investigation claims lives before answers emerge.',
      'The "mystery" was an elaborate distraction.',
    ],
  },
  {
    type: 'treasure',
    titles: ['The %LOCATION% Hoard', '%ACTOR%\'s Fortune', 'Riches and Ruin', 'Gold Fever'],
    summaries: (actors, location) => [
      `Word of treasure in ${location} draws fortune-seekers.`,
      `${actors[0]} races rivals to claim the prize.`,
      `Greed poisons every alliance. Trust no one.`,
    ],
    outcomes: [
      'The treasure is claimed. Wealth flows.',
      'The treasure was cursed. Misfortune follows.',
      'The treasure was a trap. Bodies pile up.',
      'The treasure proves smaller than legend suggested.',
      'The true treasure was knowledge, not gold.',
    ],
  },
  {
    type: 'prophecy',
    titles: ['The Foretelling', 'Signs and Portents', 'What Was Written', 'The Chosen One'],
    summaries: (actors, location) => [
      `Ancient prophecy stirs. ${actors[0]} may be the key.`,
      `The seers spoke of ${location}. The time is now.`,
      `Those who would prevent destiny clash with those who would fulfill it.`,
    ],
    outcomes: [
      'The prophecy is fulfilled as foretold.',
      'The prophecy is averted at great cost.',
      'The prophecy was misinterpreted all along.',
      'The prophecy was a lie—or a test.',
      'Multiple claimants fight over the prophetic role.',
    ],
  },
  {
    type: 'expedition',
    titles: ['Into the Unknown', 'The %LOCATION% Expedition', 'Beyond the Map', 'First Footsteps'],
    summaries: (actors, location) => [
      `${actors[0]} ventures where none have gone before.`,
      `The blank spaces on the map call to the bold.`,
      `What wonders—or horrors—await in ${location}?`,
    ],
    outcomes: [
      'New lands are claimed. History is made.',
      'The expedition vanishes without trace.',
      'They return changed—but refuse to speak of what they saw.',
      'Something followed them back.',
      'The discovery reshapes the political landscape.',
    ],
  },
  {
    type: 'artifact',
    titles: ['The %ACTOR% Blade', 'Quest for the %LOCATION% Crown', 'Legendary Arms', 'The Lost Relic'],
    summaries: (actors, location) => [
      `A legendary artifact has surfaced near ${location}.`,
      `${actors[0]} seeks a weapon of terrible power.`,
      `Whoever claims the relic may tip the balance of power.`,
    ],
    outcomes: [
      'The artifact is claimed and its power unleashed.',
      'The artifact proves too dangerous and is destroyed.',
      'The artifact chooses its own wielder.',
      'The artifact was fake—the real one remains hidden.',
      'Multiple fragments must be reunited.',
    ],
  },
  {
    type: 'lost-heir',
    titles: ['The Hidden Bloodline', 'Rightful Heir of %LOCATION%', 'A Crown Unclaimed', 'Blood Will Tell'],
    summaries: (actors, location) => [
      `Someone in ${location} carries royal blood unknowingly.`,
      `${actors[0]} may be heir to more than they know.`,
      `Birthmarks, signet rings, dying confessions—the truth emerges.`,
    ],
    outcomes: [
      'The heir claims their birthright.',
      'The heir rejects the throne for a simpler life.',
      'The heir is assassinated before the claim is made.',
      'The bloodline proves to be a fabrication.',
      'Multiple heirs emerge, each with valid claims.',
    ],
  },
  {
    type: 'ancient-evil',
    titles: ['The Awakening', 'What Sleeps Beneath %LOCATION%', 'The Old Darkness Returns', 'Seals Breaking'],
    summaries: (actors, location) => [
      `Something sealed away long ago stirs in ${location}.`,
      `Ancient wards fail. What they imprisoned walks again.`,
      `${actors[0]} races to prevent catastrophe.`,
    ],
    outcomes: [
      'The evil is resealed, but weakened watchers remain.',
      'The evil is destroyed at tremendous cost.',
      'The evil proves to be misunderstood—not evil at all.',
      'The evil escapes and begins its conquest.',
      'A bargain is struck with the awakened power.',
    ],
  },
  {
    type: 'portal',
    titles: ['The Gate Opens', 'Between Worlds', 'The %LOCATION% Rift', 'Doorway to Elsewhere'],
    summaries: (actors, location) => [
      `A portal has opened near ${location}. What comes through?`,
      `${actors[0]} discovers a gateway between realities.`,
      `Traffic flows both ways. Not all visitors are welcome.`,
    ],
    outcomes: [
      'The portal is closed before disaster.',
      'An alliance forms across the threshold.',
      'Invasion pours through. Defense is mounted.',
      'Someone important is lost to the other side.',
      'The portal becomes a valuable trade route.',
    ],
  },

  // === SOCIAL STORIES ===
  {
    type: 'romance',
    titles: ['%ACTOR% and %ACTOR%', 'Forbidden Love', 'Hearts Entwined', 'Against All Custom'],
    summaries: (actors, location) => [
      `Love blooms between ${actors[0]} and ${actors[1] ?? 'an unlikely partner'}.`,
      `In ${location}, hearts conspire what politics would forbid.`,
    ],
    outcomes: [
      'Love conquers all. They wed.',
      'Duty prevails over passion. Hearts break.',
      'One lover betrays the other.',
      'They elope, burning all bridges.',
      'Tragedy claims one; the other mourns forever.',
    ],
  },
  {
    type: 'rise',
    titles: ['The Rise of %ACTOR%', 'From Nothing to Everything', 'A Star Ascends', 'The Climb'],
    summaries: (actors, location) => [
      `${actors[0]} is becoming someone to watch.`,
      `Power and fame gather around a rising figure in ${location}.`,
      `From humble origins, greatness emerges.`,
    ],
    outcomes: [
      'They achieve their ambition and more.',
      'They overreach and crash down.',
      'They attract powerful enemies.',
      'They become what they once despised.',
      'They lift others as they climb.',
    ],
  },
  {
    type: 'fall',
    titles: ['The Fall of %ACTOR%', 'How the Mighty Crumble', 'Twilight', 'The Last Days of %ACTOR%'],
    summaries: (actors, location) => [
      `${actors[0]}'s power wanes. Vultures circle.`,
      `What was once mighty in ${location} totters on the brink.`,
      `Allies become enemies. Friends become strangers.`,
    ],
    outcomes: [
      'The fall is complete. Nothing remains.',
      'A desperate comeback succeeds.',
      'They fall, but take enemies with them.',
      'They accept their fate with grace.',
      'A loyal few stand with them to the end.',
    ],
  },
  {
    type: 'scandal',
    titles: ['The %LOCATION% Scandal', 'Reputation in Ruins', 'Whispers and Accusations', 'Public Disgrace'],
    summaries: (actors, location) => [
      `${actors[0]}'s secret is about to become very public.`,
      `Accusations fly in ${location}. Someone's reputation will not survive.`,
      `The truth—or a convincing lie—threatens to destroy everything.`,
    ],
    outcomes: [
      'The scandal proves true. Exile follows.',
      'The accusation is false, but mud sticks.',
      'The accuser is exposed as a fraud.',
      'A greater scandal eclipses the first.',
      'Brazening it out somehow works.',
    ],
  },
  {
    type: 'betrayal',
    titles: ['%ACTOR%\'s Betrayal', 'The Knife in the Back', 'Trust Broken', 'Et Tu?'],
    summaries: (actors, location) => [
      `${actors[0]} is betrayed by ${actors[1] ?? 'someone trusted'}.`,
      `In ${location}, a trusted ally reveals their true allegiance.`,
      `The betrayal cuts deep. Nothing will be the same.`,
    ],
    outcomes: [
      'The betrayer succeeds completely.',
      'The betrayal is discovered just in time.',
      'Both betrayer and betrayed are destroyed.',
      'The betrayer has a change of heart.',
      'It was a test of loyalty all along.',
    ],
  },
  {
    type: 'succession',
    titles: ['The %LOCATION% Succession', 'Crown and Contenders', 'Who Will Rule?', 'The Empty Throne'],
    summaries: (actors, location) => [
      `With the ruler gone, ${location} needs a new leader.`,
      `Multiple claimants vie for power. ${actors[0]} makes their move.`,
      `Legitimacy, force, and cunning all have their advocates.`,
    ],
    outcomes: [
      'The rightful heir prevails.',
      'The strongest claimant seizes power.',
      'Civil war erupts over the succession.',
      'An outside power dictates the succession.',
      'An unexpected candidate emerges victorious.',
    ],
  },
  {
    type: 'exile',
    titles: ['The Exile of %ACTOR%', 'Cast Out', 'No Home Remaining', 'Wanderer\'s Road'],
    summaries: (actors, location) => [
      `${actors[0]} is banished from ${location}.`,
      `An exile begins. Where will they go? What will they become?`,
      `Behind, everything they knew. Ahead, only uncertainty.`,
    ],
    outcomes: [
      'The exile finds a new home and purpose.',
      'The exile returns in triumph.',
      'The exile dies in obscurity.',
      'The exile builds power abroad and returns for vengeance.',
      'The exile is pardoned, but the scars remain.',
    ],
  },
  {
    type: 'redemption',
    titles: ['%ACTOR%\'s Redemption', 'The Road Back', 'Atonement', 'Second Chances'],
    summaries: (actors, location) => [
      `${actors[0]} seeks to atone for past sins.`,
      `In ${location}, someone fights to prove they have changed.`,
      `Can the past truly be escaped?`,
    ],
    outcomes: [
      'Redemption is earned. The past is forgiven.',
      'Some sins cannot be forgiven. The quest fails.',
      'Redemption comes through sacrifice.',
      'The attempt at redemption is a deception.',
      'They save others but cannot save themselves.',
    ],
  },

  // === SURVIVAL STORIES ===
  {
    type: 'rescue',
    titles: ['The Rescue of %ACTOR%', 'Into the %LOCATION%', 'Against All Odds', 'Every Hour Counts'],
    summaries: (actors, location) => [
      `${actors[1] ?? 'Someone important'} has been taken. ${actors[0]} must act.`,
      `A desperate mission into ${location} begins.`,
      `Time is running out for the captive.`,
    ],
    outcomes: [
      'The captive is saved, battered but alive.',
      'The rescue comes too late.',
      'The captive is rescued, but at terrible cost.',
      'The captor is defeated; the captive was bait.',
      'The captive rescues themselves before help arrives.',
    ],
  },
  {
    type: 'plague',
    titles: ['The %LOCATION% Plague', 'Death Walks', 'The Spreading Sickness', 'Quarantine'],
    summaries: (actors, location) => [
      `A deadly sickness sweeps through ${location}.`,
      `The sick are shunned. The healthy live in fear.`,
      `${actors[0]} races to find a cure—or a cause.`,
    ],
    outcomes: [
      'A cure is found. The plague ends.',
      'The plague burns itself out—but at terrible cost.',
      'The plague spreads to new regions.',
      'The plague proves to be deliberate.',
      'Immunity emerges among survivors.',
    ],
  },
  {
    type: 'famine',
    titles: ['The Hungry Year', 'Empty Granaries of %LOCATION%', 'When Harvests Fail', 'Starvation Stalks'],
    summaries: (actors, location) => [
      `Famine grips ${location}. The people starve.`,
      `Food becomes more precious than gold.`,
      `${actors[0]} seeks supplies—by any means necessary.`,
    ],
    outcomes: [
      'Aid arrives from unexpected quarters.',
      'The famine claims countless lives.',
      'Hoarded food is discovered and redistributed.',
      'The famine drives mass migration.',
      'The famine proves to be engineered.',
    ],
  },
  {
    type: 'migration',
    titles: ['The Great Migration', 'Exodus from %LOCATION%', 'A People in Motion', 'The Long March'],
    summaries: (actors, location) => [
      `A great movement of people—or creatures—passes through ${location}.`,
      `${actors[0]} leads their people to a new home.`,
      `Everything is changing. The old order crumbles.`,
    ],
    outcomes: [
      'The migrants find a new home.',
      'The migrants are turned back or destroyed.',
      'The migration destabilizes multiple regions.',
      'The migrants conquer rather than settle.',
      'Integration proves possible, if difficult.',
    ],
  },
  {
    type: 'sanctuary',
    titles: ['Sanctuary', 'The Last Refuge', 'Safe Harbor', 'Walls Against the Dark'],
    summaries: (actors, location) => [
      `${location} is the last safe place—and it is threatened.`,
      `${actors[0]} fights to protect those who cannot protect themselves.`,
      `If this place falls, there is nowhere left to go.`,
    ],
    outcomes: [
      'The sanctuary holds. The threat is repelled.',
      'The sanctuary falls. Refugees scatter.',
      'The threat is revealed to come from within.',
      'The sanctuary is saved, but forever changed.',
      'A new, safer sanctuary is found.',
    ],
  },
  {
    type: 'curse',
    titles: ['The %LOCATION% Curse', 'Doom Upon %ACTOR%', 'The Witch\'s Word', 'Malediction'],
    summaries: (actors, location) => [
      `A curse has fallen upon ${location}—or upon ${actors[0]}.`,
      `The terms of breaking the curse seem impossible.`,
      `Day by day, the curse tightens its grip.`,
    ],
    outcomes: [
      'The curse is broken. Freedom restored.',
      'The curse claims its victim.',
      'The curse is transferred to another.',
      'The curse proves to be a blessing in disguise.',
      'Living with the curse proves manageable.',
    ],
  },
  {
    type: 'hunt-survival',
    titles: ['The Hunted', '%ACTOR% Runs', 'No Escape', 'Prey'],
    summaries: (actors, location) => [
      `${actors[0]} is being hunted through ${location}.`,
      `Pursuers close in from all sides. Escape seems impossible.`,
      `Every shadow could hide a hunter.`,
    ],
    outcomes: [
      'The hunted escapes against all odds.',
      'The hunted turns the tables on their pursuers.',
      'The hunted is captured or killed.',
      'The hunted finds unexpected allies.',
      'The hunt reveals a larger conspiracy.',
    ],
  },

  // === INTRIGUE STORIES ===
  {
    type: 'conspiracy',
    titles: ['The %LOCATION% Conspiracy', 'Plots and Shadows', 'They Are Everywhere', 'The Hidden Hand'],
    summaries: (actors, location) => [
      `A conspiracy reaches into the heart of ${location}.`,
      `${actors[0]} stumbles onto a plot that reaches the highest levels.`,
      `Trust no one. Anyone could be part of it.`,
    ],
    outcomes: [
      'The conspiracy is exposed and destroyed.',
      'The conspiracy succeeds in its goals.',
      'The conspiracy is real—but not what it seemed.',
      'Exposing the conspiracy proves impossible.',
      'The conspirators are played by a greater power.',
    ],
  },
  {
    type: 'heist',
    titles: ['The %LOCATION% Job', 'The Perfect Crime', 'One Last Score', 'Into the Vault'],
    summaries: (actors, location) => [
      `${actors[0]} plans an audacious theft in ${location}.`,
      `The target is impregnable. The crew is ready.`,
      `Everything must go perfectly. Nothing ever does.`,
    ],
    outcomes: [
      'The heist succeeds spectacularly.',
      'The heist fails—someone talks.',
      'The prize is claimed, but at unexpected cost.',
      'The heist was a setup all along.',
      'The crew turns on each other over the prize.',
    ],
  },
  {
    type: 'infiltration',
    titles: ['The Mole', 'Enemy Among Us', 'The %LOCATION% Spy', 'Trust and Treachery'],
    summaries: (actors, location) => [
      `There is a spy in ${location}. But who?`,
      `${actors[0]} must identify the infiltrator before more damage is done.`,
      `Paranoia spreads. Old friends are suspected.`,
    ],
    outcomes: [
      'The spy is caught and justice served.',
      'The spy escapes with critical secrets.',
      'The wrong person is accused. The real spy continues.',
      'The spy becomes a double agent.',
      'Everyone was spying on everyone else.',
    ],
  },
  {
    type: 'blackmail',
    titles: ['Secrets for Sale', 'The %ACTOR% Letters', 'What They Know', 'Silence Has a Price'],
    summaries: (actors, location) => [
      `Someone has damaging information about ${actors[0]}.`,
      `In ${location}, secrets become currency.`,
      `Pay the price, or face exposure.`,
    ],
    outcomes: [
      'The blackmailer is silenced.',
      'The victim pays and pays and pays.',
      'The secret is exposed—consequences follow.',
      'The blackmailer is blackmailed in turn.',
      'The secret turns out to be already known.',
    ],
  },
  {
    type: 'imposter',
    titles: ['The False %ACTOR%', 'Who Are You Really?', 'Stolen Identity', 'The Pretender'],
    summaries: (actors, location) => [
      `Someone in ${location} is not who they claim to be.`,
      `${actors[0]} suspects an imposter—but can they prove it?`,
      `The deception runs deep. Even memories lie.`,
    ],
    outcomes: [
      'The imposter is exposed dramatically.',
      'The imposter achieves their goal before discovery.',
      'The imposter becomes the role they played.',
      'The "imposter" is actually the real person.',
      'Multiple imposters complicate everything.',
    ],
  },
  {
    type: 'cult',
    titles: ['The Hidden Church', 'Dark Devotion', 'The %LOCATION% Cult', 'Forbidden Worship'],
    summaries: (actors, location) => [
      `A secret cult spreads its influence through ${location}.`,
      `${actors[0]} uncovers unsettling rituals and darker plans.`,
      `How many are already members? The answer terrifies.`,
    ],
    outcomes: [
      'The cult is destroyed root and branch.',
      'The cult achieves its apocalyptic goal.',
      'The cult is contained but not eliminated.',
      'The cult\'s beliefs prove to be valid.',
      'The cult fractures into warring sects.',
    ],
  },

  // === SUPERNATURAL STORIES ===
  {
    type: 'haunting',
    titles: ['The %LOCATION% Haunting', 'Unquiet Dead', 'What Lingers', 'Echoes of the Past'],
    summaries: (actors, location) => [
      `The dead do not rest peacefully in ${location}.`,
      `${actors[0]} confronts spirits who refuse to pass on.`,
      `What do the ghosts want? What will make them stop?`,
    ],
    outcomes: [
      'The spirits are laid to rest.',
      'The haunting intensifies to lethal levels.',
      'Coexistence is negotiated.',
      'The ghosts reveal crucial information.',
      'The "haunting" proves to have mortal origins.',
    ],
  },
  {
    type: 'possession',
    titles: ['Not Themselves', 'The Thing Inside', 'Stolen Mind', 'The Possession of %ACTOR%'],
    summaries: (actors, location) => [
      `Something has taken control of ${actors[0]}.`,
      `In ${location}, a trusted person acts with another's will.`,
      `Can the possession be broken before irrevocable harm is done?`,
    ],
    outcomes: [
      'The possession is ended. The host recovers.',
      'The host is destroyed to stop the possessor.',
      'The possessor is bargained with.',
      'The host willingly surrendered control.',
      'The possessor and host merge into something new.',
    ],
  },
  {
    type: 'transformation',
    titles: ['Becoming', '%ACTOR%\'s Change', 'What I Am Now', 'Metamorphosis'],
    summaries: (actors, location) => [
      `${actors[0]} is changing into something else.`,
      `In ${location}, a transformation beyond medicine unfolds.`,
      `Can the change be stopped? Should it be?`,
    ],
    outcomes: [
      'The transformation is reversed.',
      'The transformation completes. A new creature exists.',
      'The transformation is embraced.',
      'The transformation can be controlled.',
      'The transformation spreads to others.',
    ],
  },
  {
    type: 'pact',
    titles: ['The Bargain', 'What Was Promised', 'Payment Due', 'The %ACTOR% Compact'],
    summaries: (actors, location) => [
      `${actors[0]} made a deal with powers best left alone.`,
      `In ${location}, ancient bargains come due.`,
      `The terms seemed fair once. They do not seem fair now.`,
    ],
    outcomes: [
      'The pact is fulfilled as agreed.',
      'A loophole is found. The pact is broken.',
      'The pact-maker pays the full price.',
      'The terms are renegotiated at great cost.',
      'The other party to the pact is destroyed.',
    ],
  },
  {
    type: 'rift',
    titles: ['The Tear in Reality', 'Where Worlds Touch', 'The %LOCATION% Rift', 'Bleeding Through'],
    summaries: (actors, location) => [
      `Reality itself is wounded near ${location}.`,
      `Strange things leak through. The boundaries fail.`,
      `${actors[0]} must seal the rift—or exploit it.`,
    ],
    outcomes: [
      'The rift is sealed. Reality stabilizes.',
      'The rift expands. Multiple realities collide.',
      'The rift becomes permanent but manageable.',
      'Something crosses through that cannot be uncrossed.',
      'The rift proves to be a deliberate doorway.',
    ],
  },
  {
    type: 'awakening',
    titles: ['Power Manifest', 'The Gift', 'Something Awakens', '%ACTOR% Awakens'],
    summaries: (actors, location) => [
      `${actors[0]} discovers power within themselves.`,
      `In ${location}, latent abilities surge to life.`,
      `With power comes fear—from others and from within.`,
    ],
    outcomes: [
      'The power is mastered and used for good.',
      'The power proves uncontrollable.',
      'Others seek to claim or destroy the awakened one.',
      'The awakening spreads to others.',
      'The power fades as mysteriously as it came.',
    ],
  },
];

// Generate a new story thread from events
export function generateStoryThread(
  rng: Random,
  type: StoryType,
  actors: string[],
  location: string,
  worldTime: Date,
  triggeringSummary: string,
): StoryThread {
  const template = STORY_TEMPLATES.find((t) => t.type === type) ?? STORY_TEMPLATES[0];

  // Generate title
  let title = rng.pick(template.titles);

  // Replace placeholders with proper handling to avoid double articles
  if (actors[0]) {
    // For first actor, avoid "The The Name" by checking if name starts with "The"
    let actorName = actors[0];
    title = title.replace('%ACTOR%', actorName);
  } else {
    title = title.replace('%ACTOR%', 'Someone');
  }

  if (actors[1]) {
    // For second actor, same logic
    let actorName = actors[1];
    title = title.replace('%ACTOR%', actorName);
  } else if (actors[0]) {
    // If no second actor, replace remaining %ACTOR% with first actor
    title = title.replace('%ACTOR%', actors[0]);
  } else {
    title = title.replace('%ACTOR%', 'Someone');
  }

  title = title.replace('%LOCATION%', location);

  // Clean up any remaining double articles
  title = title.replace(/\bThe The\b/g, 'The');

  // Generate summary
  const summaryOptions = template.summaries(actors, location);
  const summary = rng.pick(summaryOptions);

  // Build enhanced context for richer storytelling
  const context = buildStoryContext(rng, type, actors, location, worldTime);
  const branchingState = initializeBranchingState(rng, type);

  return {
    id: rng.uid('story'),
    type,
    title,
    summary,
    phase: 'inciting',
    actors,
    location,
    startedAt: worldTime,
    lastUpdated: worldTime,
    tension: 1,
    beats: [
      {
        timestamp: worldTime,
        summary: triggeringSummary,
        tensionChange: 1,
      },
    ],
    potentialOutcomes: template.outcomes,
    resolved: false,
    context,
    branchingState,
  };
}

// Build contextual information for richer storytelling
function buildStoryContext(
  rng: Random,
  type: StoryType,
  actors: string[],
  location: string,
  worldTime: Date,
): StoryThread['context'] {
  const context: NonNullable<StoryThread['context']> = {
    actorRelationships: [],
    keyLocations: [],
    themes: [],
    motivations: {},
  };

  // Extract themes based on story type
  const themeMap: Partial<Record<StoryType, string[]>> = {
    hunt: ['pursuit', 'survival', 'justice'],
    feud: ['conflict', 'honor', 'rivalry'],
    revenge: ['vengeance', 'justice', 'obsession'],
    war: ['conquest', 'survival', 'glory'],
    siege: ['endurance', 'strategy', 'desperation'],
    rebellion: ['freedom', 'justice', 'change'],
    duel: ['honor', 'skill', 'resolution'],
    raid: ['greed', 'surprise', 'destruction'],
    mystery: ['discovery', 'truth', 'danger'],
    treasure: ['wealth', 'adventure', 'greed'],
    prophecy: ['fate', 'belief', 'destiny'],
    expedition: ['exploration', 'discovery', 'courage'],
    artifact: ['power', 'knowledge', 'danger'],
    'lost-heir': ['identity', 'inheritance', 'legitimacy'],
    'ancient-evil': ['corruption', 'salvation', 'doom'],
    romance: ['love', 'passion', 'heartbreak'],
    rise: ['ambition', 'success', 'power'],
    fall: ['hubris', 'failure', 'redemption'],
    scandal: ['shame', 'reputation', 'deception'],
    betrayal: ['trust', 'treachery', 'revenge'],
    succession: ['power', 'legitimacy', 'ambition'],
    exile: ['banishment', 'redemption', 'survival'],
    redemption: ['forgiveness', 'atonement', 'change'],
    rescue: ['heroism', 'urgency', 'sacrifice'],
    plague: ['suffering', 'healing', 'fear'],
    famine: ['scarcity', 'survival', 'community'],
    migration: ['journey', 'hope', 'adaptation'],
    sanctuary: ['protection', 'refuge', 'threat'],
    curse: ['affliction', 'breaking', 'suffering'],
    'hunt-survival': ['pursuit', 'evasion', 'survival'],
    conspiracy: ['deception', 'plot', 'exposure'],
    heist: ['theft', 'skill', 'risk'],
    infiltration: ['deception', 'espionage', 'discovery'],
    blackmail: ['secrets', 'power', 'extortion'],
    imposter: ['deception', 'identity', 'exposure'],
    cult: ['belief', 'devotion', 'manipulation'],
    haunting: ['supernatural', 'torment', 'release'],
    possession: ['control', 'struggle', 'exorcism'],
    transformation: ['change', 'identity', 'acceptance'],
    pact: ['bargain', 'power', 'consequences'],
    rift: ['reality', 'chaos', 'closure'],
    awakening: ['power', 'responsibility', 'control'],
  };

  // Pick 1-3 themes for this story
  const availableThemes = themeMap[type] || ['conflict'];
  const numThemes = Math.min(rng.int(3) + 1, availableThemes.length);
  context.themes = [];
  const shuffledThemes = rng.shuffle(availableThemes);
  for (let i = 0; i < numThemes; i++) {
    context.themes.push(shuffledThemes[i]);
  }

  // Generate actor motivations
  for (const actor of actors) {
    const motivationTemplates = [
      'seeks power and influence',
      'driven by personal vendetta',
      'motivated by duty and honor',
      'seeks wealth and riches',
      'driven by curiosity and discovery',
      'motivated by love and protection',
      'seeks justice and righteousness',
      'driven by ambition and status',
      'motivated by fear and survival',
      'seeks knowledge and wisdom',
    ];
    context.motivations![actor] = rng.pick(motivationTemplates);
  }

  // Add key locations
  context.keyLocations = [location];
  if (rng.chance(0.3)) context.keyLocations.push(rng.pick(['ancient ruins', 'hidden grove', 'abandoned tower', 'sacred temple', 'forgotten crypt']));

  // Add actor relationships (if multiple actors)
  if (actors.length >= 2 && actors[0] && actors[1]) {
    const relationshipTemplates = [
      `${actors[0]} and ${actors[1]} were once allies`,
      `${actors[0]} betrayed ${actors[1]} in the past`,
      `${actors[0]} is ${actors[1]}'s rival`,
      `${actors[0]} owes ${actors[1]} a debt`,
      `${actors[0]} and ${actors[1]} share a common enemy`,
      `${actors[0]} is jealous of ${actors[1]}`,
      `${actors[0]} mentors ${actors[1]}`,
      `${actors[0]} and ${actors[1]} are family`,
    ];
    if (rng.chance(0.6)) {
      context.actorRelationships!.push(rng.pick(relationshipTemplates));
    }
  }

  return context;
}

// Initialize branching narrative state
function initializeBranchingState(rng: Random, type: StoryType): StoryThread['branchingState'] {
  // For now, start with basic branching potential
  // Future enhancement: more complex branching based on story type
  const choices: string[] = [];

  if (type === 'revenge') {
    choices.push('pursue direct confrontation', 'use deception and allies', 'seek magical aid');
  } else if (type === 'mystery') {
    choices.push('follow the evidence trail', 'consult local experts', 'risk dangerous shortcuts');
  } else if (type === 'war') {
    choices.push('focus on defense', 'launch preemptive strikes', 'seek diplomatic solutions');
  }

  return {
    path: 'main',
    choices: choices.length > 0 ? choices : undefined,
    variables: {},
  };
}

// Generate contextual progression beats using story context
function generateContextualBeat(rng: Random, story: StoryThread, worldTime: Date): string {
  const context = story.context;
  const actors = story.actors;
  const location = story.location;
  const type = story.type;

  // Start with generic beats
  let beat = rng.pick(PROGRESSION_BEATS[story.type] ?? PROGRESSION_BEATS.mystery);

  // Enhance with context if available
  if (context) {
    // Replace generic terms with specific actor names
    if (actors.length > 0) {
      // Replace hunter/pursuer terms with first actor
      beat = beat.replace(/\bhunter\b|\bhunters\b|\bavenger\b|\bpursuer\b/gi, actors[0]);
      beat = beat.replace(/\bseeker\b|\bseekers\b|\bexplorer\b|\bexplorers\b/gi, actors[0]);

      if (actors.length > 1) {
        // Replace target/enemy terms with second actor
        beat = beat.replace(/\btarget\b|\benemy\b|\bfoe\b|\bquarry\b/gi, actors[1]);
        beat = beat.replace(/\brival\b|\brivals\b|\bcompetitor\b|\bcompetitors\b/gi, actors[1]);
      }
    }

    // Add location-specific details
    if (context.keyLocations && context.keyLocations.length > 1) {
      const secondaryLocation = context.keyLocations.find(loc => loc !== location);
      if (secondaryLocation && rng.chance(0.3)) {
        beat = beat.replace(/area|region|territory/gi, secondaryLocation);
      }
    }

    // Add motivation-driven details
    if (context.motivations && Object.keys(context.motivations).length > 0) {
      const motivations = Object.values(context.motivations);
      if (rng.chance(0.2)) {
        const motivation = rng.pick(motivations);
        // Make sure we have an actor to reference
        if (actors[0]) {
          beat += ` ${actors[0]} remains ${motivation}.`;
        }
      }
    }

    // Add theme-appropriate embellishments
    if (context.themes && context.themes.length > 0) {
      const theme = rng.pick(context.themes);
      if (rng.chance(0.15)) {
        const embellishments = {
          revenge: 'The cycle of vengeance continues.',
          justice: 'Justice demands its due.',
          power: 'Power shifts in subtle ways.',
          discovery: 'Secrets begin to surface.',
          betrayal: 'Trust proves fragile.',
          redemption: 'Paths to redemption emerge.',
          corruption: 'Darkness spreads its influence.',
          salvation: 'Hope flickers in the darkness.',
        };
        if (embellishments[theme as keyof typeof embellishments]) {
          beat += ` ${embellishments[theme as keyof typeof embellishments]}`;
        }
      }
    }

    // Add relationship-driven details
    if (context.actorRelationships && context.actorRelationships.length > 0 && rng.chance(0.1)) {
      const relationship = rng.pick(context.actorRelationships);
      if (relationship && relationship.trim()) {
        beat += ` ${relationship}, complicating matters.`;
      }
    }
  }

  return beat;
}

// Add a beat to an existing story
export function addStoryBeat(
  story: StoryThread,
  summary: string,
  tensionChange: number,
  worldTime: Date,
): void {
  story.beats.push({
    timestamp: worldTime,
    summary,
    tensionChange,
  });
  story.tension = Math.max(0, Math.min(10, story.tension + tensionChange));
  story.lastUpdated = worldTime;

  // Update phase based on tension
  if (story.tension >= 8 && story.phase !== 'climax') {
    story.phase = 'climax';
  } else if (story.tension >= 5 && story.phase === 'inciting') {
    story.phase = 'rising';
  }
}

// Resolve a story
export function resolveStory(
  rng: Random,
  story: StoryThread,
  worldTime: Date,
): string {
  const resolution = rng.pick(story.potentialOutcomes);
  story.resolved = true;
  story.resolution = resolution;
  story.phase = 'aftermath';
  story.lastUpdated = worldTime;

  addStoryBeat(story, `Resolution: ${resolution}`, 0, worldTime);

  return resolution;
}

// Check if events should spawn new stories
export function checkForStorySpawn(
  event: LogEntry,
  world: WorldState,
  rng: Random,
  activeStories: StoryThread[],
): StoryThread | null {
  // Don't spawn too many concurrent stories
  const unresolvedCount = activeStories.filter((s) => !s.resolved).length;
  if (unresolvedCount >= 8) return null;

  const summary = event.summary.toLowerCase();
  const details = (event.details ?? '').toLowerCase();
  const actors = event.actors ?? [];
  const location = event.location ?? 'the region';

  // Analyze event for story potential
  let storyType: StoryType | null = null;
  let storyChance = 0;

  // === CONFLICT TRIGGERS ===
  
  // Combat events
  if (summary.includes('ambush') || summary.includes('clash') || summary.includes('battle')) {
    if (summary.includes('defeat') || summary.includes('driven back')) {
      storyType = 'revenge';
      storyChance = 0.15;
    } else if (actors.length >= 2) {
      storyType = 'feud';
      storyChance = 0.1;
    }
  }

  // Siege events
  if (summary.includes('siege') || summary.includes('surround') || summary.includes('blockade')) {
    storyType = 'siege';
    storyChance = 0.25;
  }

  // Uprising events
  if (summary.includes('uprising') || summary.includes('rebel') || summary.includes('revolt') || summary.includes('riot')) {
    storyType = 'rebellion';
    storyChance = 0.2;
  }

  // Duel/challenge events
  if (summary.includes('duel') || summary.includes('challenge') || summary.includes('honor demands')) {
    storyType = 'duel';
    storyChance = 0.3;
  }

  // Raid events
  if (summary.includes('raid') || summary.includes('plunder') || (summary.includes('strike') && summary.includes('withdraw'))) {
    storyType = 'raid';
    storyChance = 0.15;
  }

  // === DISCOVERY TRIGGERS ===
  
  // Discovery events
  if (summary.includes('discover') || summary.includes('uncover') || summary.includes('find')) {
    if (summary.includes('artifact') || summary.includes('legendary') || summary.includes('ancient weapon')) {
      storyType = 'artifact';
      storyChance = 0.25;
    } else if (summary.includes('treasure') || summary.includes('gold') || summary.includes('hoard')) {
      storyType = 'treasure';
      storyChance = 0.2;
    } else if (summary.includes('heir') || summary.includes('bloodline') || summary.includes('birthright')) {
      storyType = 'lost-heir';
      storyChance = 0.25;
    } else {
      storyType = 'mystery';
      storyChance = 0.1;
    }
  }

  // Expedition events
  if (summary.includes('expedition') || summary.includes('explore') || summary.includes('uncharted')) {
    storyType = 'expedition';
    storyChance = 0.2;
  }

  // Ancient evil / awakening events
  if (summary.includes('awaken') || summary.includes('stir') || summary.includes('seal') || summary.includes('ancient evil')) {
    storyType = 'ancient-evil';
    storyChance = 0.2;
  }

  // Portal events
  if (summary.includes('portal') || summary.includes('rift') || summary.includes('gateway') || summary.includes('tear in reality')) {
    storyType = 'portal';
    storyChance = 0.25;
  }

  // Prophecy events
  if (summary.includes('prophecy') || summary.includes('foretold') || summary.includes('chosen') || summary.includes('omen')) {
    storyType = 'prophecy';
    storyChance = 0.15;
  }

  // === SOCIAL TRIGGERS ===
  
  // Fame/notoriety events
  if (summary.includes('renown') || summary.includes('famous') || summary.includes('hailed') || summary.includes('celebrated')) {
    storyType = 'rise';
    storyChance = 0.15;
  }

  // Fall events
  if (summary.includes('disgrace') || summary.includes('ruined') || summary.includes('downfall') || summary.includes('stripped of')) {
    storyType = 'fall';
    storyChance = 0.15;
  }

  // Scandal events
  if (summary.includes('scandal') || summary.includes('exposed') || summary.includes('shame') || summary.includes('accused')) {
    storyType = 'scandal';
    storyChance = 0.2;
  }

  // Betrayal events
  if (summary.includes('betray') || summary.includes('treacher') || summary.includes('turned against')) {
    storyType = 'betrayal';
    storyChance = 0.2;
  }

  // Succession events
  if (summary.includes('succession') || summary.includes('heir') || summary.includes('throne') || (summary.includes('death') && summary.includes('lord'))) {
    storyType = 'succession';
    storyChance = 0.2;
  }

  // Exile events
  if (summary.includes('exile') || summary.includes('banish') || summary.includes('cast out')) {
    storyType = 'exile';
    storyChance = 0.2;
  }

  // Romance events  
  if (summary.includes('love') || summary.includes('court') || summary.includes('wed') || summary.includes('affair')) {
    storyType = 'romance';
    storyChance = 0.12;
  }

  // === SURVIVAL TRIGGERS ===
  
  // Threat events
  if (summary.includes('threat') || summary.includes('danger') || summary.includes('monster')) {
    storyType = 'hunt';
    storyChance = 0.15;
  }

  // Faction war events
  if (summary.includes('faction') && (summary.includes('conflict') || summary.includes('tension') || summary.includes('war'))) {
    storyType = 'war';
    storyChance = 0.08;
  }

  // Missing/captive events
  if (summary.includes('missing') || summary.includes('taken') || summary.includes('captive') || summary.includes('kidnap')) {
    storyType = 'rescue';
    storyChance = 0.2;
  }

  // Plague events
  if (summary.includes('plague') || summary.includes('sickness') || summary.includes('disease') || summary.includes('epidemic')) {
    storyType = 'plague';
    storyChance = 0.2;
  }

  // Famine events
  if (summary.includes('famine') || summary.includes('starv') || summary.includes('hunger') || summary.includes('crop fail')) {
    storyType = 'famine';
    storyChance = 0.2;
  }

  // Migration events
  if (summary.includes('migration') || summary.includes('exodus') || summary.includes('flee') || summary.includes('refugee')) {
    storyType = 'migration';
    storyChance = 0.15;
  }

  // Curse events
  if (summary.includes('curse') || summary.includes('hex') || summary.includes('malediction') || summary.includes('blighted')) {
    storyType = 'curse';
    storyChance = 0.2;
  }

  // Being hunted events
  if (summary.includes('hunted') || summary.includes('pursued') || summary.includes('on the run') || summary.includes('flee')) {
    if (storyType !== 'migration') {
      storyType = 'hunt-survival';
      storyChance = 0.15;
    }
  }

  // === INTRIGUE TRIGGERS ===
  
  // Conspiracy events
  if (summary.includes('conspiracy') || summary.includes('plot') || summary.includes('scheme') || summary.includes('cabal')) {
    storyType = 'conspiracy';
    storyChance = 0.2;
  }

  // Heist events
  if (summary.includes('heist') || summary.includes('rob') || summary.includes('steal') || summary.includes('vault')) {
    storyType = 'heist';
    storyChance = 0.2;
  }

  // Spy events
  if (summary.includes('spy') || summary.includes('infiltrat') || summary.includes('mole') || summary.includes('double agent')) {
    storyType = 'infiltration';
    storyChance = 0.2;
  }

  // Blackmail events
  if (summary.includes('blackmail') || summary.includes('extort') || summary.includes('secret') && summary.includes('threaten')) {
    storyType = 'blackmail';
    storyChance = 0.18;
  }

  // Imposter events
  if (summary.includes('imposter') || summary.includes('pretend') || summary.includes('false identity') || summary.includes('disguise')) {
    storyType = 'imposter';
    storyChance = 0.2;
  }

  // Cult events
  if (summary.includes('cult') || summary.includes('sect') || summary.includes('dark worship') || summary.includes('forbidden ritual')) {
    storyType = 'cult';
    storyChance = 0.2;
  }

  // === SUPERNATURAL TRIGGERS ===
  
  // Haunting events
  if (summary.includes('haunt') || summary.includes('ghost') || summary.includes('spirit') || summary.includes('apparition')) {
    storyType = 'haunting';
    storyChance = 0.18;
  }

  // Possession events
  if (summary.includes('possess') || summary.includes('control') || summary.includes('not themselves') || details.includes('acting strangely')) {
    storyType = 'possession';
    storyChance = 0.18;
  }

  // Transformation events
  if (summary.includes('transform') || summary.includes('changing') || summary.includes('becoming') || summary.includes('lycanthrop')) {
    storyType = 'transformation';
    storyChance = 0.2;
  }

  // Pact events
  if (summary.includes('pact') || summary.includes('bargain') || summary.includes('deal with') || summary.includes('contract')) {
    storyType = 'pact';
    storyChance = 0.18;
  }

  // Rift events
  if (summary.includes('rift') || summary.includes('tear') || summary.includes('reality') || summary.includes('dimension')) {
    storyType = 'rift';
    storyChance = 0.2;
  }

  // Awakening power events
  if (summary.includes('power manifest') || summary.includes('ability awaken') || summary.includes('gift emerges')) {
    storyType = 'awakening';
    storyChance = 0.18;
  }

  if (!storyType || !rng.chance(storyChance)) {
    return null;
  }

  // Check if we already have a similar story
  const existingSimilar = activeStories.find(
    (s) =>
      !s.resolved &&
      s.type === storyType &&
      s.actors.some((a) => actors.includes(a)),
  );

  if (existingSimilar) {
    // Add a beat to existing story instead
    addStoryBeat(existingSimilar, event.summary, 1, event.worldTime);
    return null;
  }

  // Create new story
  return generateStoryThread(
    rng,
    storyType,
    actors.length > 0 ? actors : [randomName(rng)],
    location,
    event.worldTime,
    event.summary,
  );
}

// Generate story progression log
export function storyProgressionLog(
  story: StoryThread,
  worldTime: Date,
  seed: string,
): LogEntry {
  const PHASE_SUMMARIES: Record<StoryPhase, string[]> = {
    inciting: [
      `The tale of "${story.title}" begins`,
      `A new thread weaves into the tapestry: ${story.title}`,
    ],
    rising: [
      `Tension mounts in "${story.title}"`,
      `The story of ${story.title} takes a turn`,
    ],
    climax: [
      `"${story.title}" approaches its climax`,
      `Critical moment looms in ${story.title}`,
    ],
    resolution: [
      `"${story.title}" reaches its conclusion`,
      `The tale of ${story.title} ends`,
    ],
    aftermath: [
      `The echoes of "${story.title}" fade`,
      `Life continues after ${story.title}`,
    ],
  };

  return {
    category: 'faction',
    summary: rng.pick(PHASE_SUMMARIES[story.phase]),
    details: story.summary + (story.resolution ? ` ${story.resolution}` : ''),
    location: story.location,
    actors: story.actors,
    worldTime,
    realTime: new Date(),
    seed,
  };
}

// Helper for templates (global function ref)
function rng(arr: string[]): string {
  return arr[0];
}

// Helper to ensure Date objects (may be strings after JSON round-trip)
function ensureDate(d: Date | string): Date {
  if (d instanceof Date) return d;
  return new Date(d);
}

// Tick active stories - advance or resolve based on time and conditions
export function tickStories(
  rng: Random,
  stories: StoryThread[],
  world: WorldState,
  worldTime: Date,
): LogEntry[] {
  const logs: LogEntry[] = [];

  for (const story of stories) {
    if (story.resolved) continue;

    // Time-based tension increase (handle string dates from JSON)
    const lastUpdated = ensureDate(story.lastUpdated);
    const daysSinceUpdate = (worldTime.getTime() - lastUpdated.getTime()) / (24 * 60 * 60 * 1000);
    if (daysSinceUpdate >= 1 && rng.chance(0.2)) {
      // Something happens in this story

      // Use contextual or generic progression beats
      const beat = generateContextualBeat(rng, story, worldTime);
      addStoryBeat(story, beat, 1, worldTime);

      logs.push({
        category: 'faction',
        summary: `${story.title}: ${beat}`,
        details: story.summary,
        location: story.location,
        actors: story.actors,
        worldTime,
        realTime: new Date(),
        seed: world.seed,
      });
    }

    // Check for resolution
    if (story.tension >= 10 || (story.phase === 'climax' && rng.chance(0.15))) {
      const resolution = resolveStory(rng, story, worldTime);
      logs.push({
        category: 'faction',
        summary: `${story.title} concludes`,
        details: resolution,
        location: story.location,
        actors: story.actors,
        worldTime,
        realTime: new Date(),
        seed: world.seed,
      });

      // Consequences of resolution
      queueConsequence({
        type: 'settlement-change',
        triggerEvent: `${story.title} resolution`,
        turnsUntilResolution: 6,
        data: {
          settlementName: story.location,
          change: 'mood-shift',
          magnitude: resolution.includes('success') || resolution.includes('achieved') ? 1 : -1,
        },
        priority: 2,
      });
    }
  }

  return logs;
}

