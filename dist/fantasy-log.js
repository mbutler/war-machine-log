// src/config.ts
var BASE_MS_PER_WORLD_MINUTE = 60000;
function parseNumber(value, fallback) {
  if (!value)
    return fallback;
  const parsed = Number(value);
  if (Number.isNaN(parsed) || parsed <= 0)
    return fallback;
  return parsed;
}
function loadConfig() {
  const timeScale = parseNumber(process.env.SIM_TIME_SCALE, 1);
  const msPerWorldMinute = Math.max(10, Math.floor(BASE_MS_PER_WORLD_MINUTE / timeScale));
  const turnMinutes = 10;
  const hourTurns = 6;
  const dayHours = 24;
  const startWorldTime = process.env.SIM_START_WORLD_TIME && !Number.isNaN(Date.parse(process.env.SIM_START_WORLD_TIME)) ? new Date(process.env.SIM_START_WORLD_TIME) : new Date;
  return {
    timeScale,
    msPerWorldMinute,
    turnMinutes,
    hourTurns,
    dayHours,
    logDir: process.env.SIM_LOG_DIR ?? "logs",
    seed: process.env.SIM_SEED ?? "default-seed",
    startWorldTime,
    catchUp: process.env.SIM_CATCH_UP !== "false",
    catchUpSpeed: parseNumber(process.env.SIM_CATCH_UP_SPEED, 10)
  };
}
var config = loadConfig();

// src/events.ts
class EventBus {
  handlers = new Map;
  subscribe(kind, handler) {
    const set = this.handlers.get(kind) ?? new Set;
    set.add(handler);
    this.handlers.set(kind, set);
    return () => {
      const current = this.handlers.get(kind);
      current?.delete(handler);
    };
  }
  publish(event) {
    const set = this.handlers.get(event.kind);
    if (!set)
      return;
    for (const handler of set) {
      handler(event);
    }
  }
}

// src/logging.ts
var { default: fs} = (() => ({}));

// node:path
function assertPath(path) {
  if (typeof path !== "string")
    throw new TypeError("Path must be a string. Received " + JSON.stringify(path));
}
function normalizeStringPosix(path, allowAboveRoot) {
  var res = "", lastSegmentLength = 0, lastSlash = -1, dots = 0, code;
  for (var i = 0;i <= path.length; ++i) {
    if (i < path.length)
      code = path.charCodeAt(i);
    else if (code === 47)
      break;
    else
      code = 47;
    if (code === 47) {
      if (lastSlash === i - 1 || dots === 1)
        ;
      else if (lastSlash !== i - 1 && dots === 2) {
        if (res.length < 2 || lastSegmentLength !== 2 || res.charCodeAt(res.length - 1) !== 46 || res.charCodeAt(res.length - 2) !== 46) {
          if (res.length > 2) {
            var lastSlashIndex = res.lastIndexOf("/");
            if (lastSlashIndex !== res.length - 1) {
              if (lastSlashIndex === -1)
                res = "", lastSegmentLength = 0;
              else
                res = res.slice(0, lastSlashIndex), lastSegmentLength = res.length - 1 - res.lastIndexOf("/");
              lastSlash = i, dots = 0;
              continue;
            }
          } else if (res.length === 2 || res.length === 1) {
            res = "", lastSegmentLength = 0, lastSlash = i, dots = 0;
            continue;
          }
        }
        if (allowAboveRoot) {
          if (res.length > 0)
            res += "/..";
          else
            res = "..";
          lastSegmentLength = 2;
        }
      } else {
        if (res.length > 0)
          res += "/" + path.slice(lastSlash + 1, i);
        else
          res = path.slice(lastSlash + 1, i);
        lastSegmentLength = i - lastSlash - 1;
      }
      lastSlash = i, dots = 0;
    } else if (code === 46 && dots !== -1)
      ++dots;
    else
      dots = -1;
  }
  return res;
}
function _format(sep, pathObject) {
  var dir = pathObject.dir || pathObject.root, base = pathObject.base || (pathObject.name || "") + (pathObject.ext || "");
  if (!dir)
    return base;
  if (dir === pathObject.root)
    return dir + base;
  return dir + sep + base;
}
function resolve() {
  var resolvedPath = "", resolvedAbsolute = false, cwd;
  for (var i = arguments.length - 1;i >= -1 && !resolvedAbsolute; i--) {
    var path;
    if (i >= 0)
      path = arguments[i];
    else {
      if (cwd === undefined)
        cwd = process.cwd();
      path = cwd;
    }
    if (assertPath(path), path.length === 0)
      continue;
    resolvedPath = path + "/" + resolvedPath, resolvedAbsolute = path.charCodeAt(0) === 47;
  }
  if (resolvedPath = normalizeStringPosix(resolvedPath, !resolvedAbsolute), resolvedAbsolute)
    if (resolvedPath.length > 0)
      return "/" + resolvedPath;
    else
      return "/";
  else if (resolvedPath.length > 0)
    return resolvedPath;
  else
    return ".";
}
function normalize(path) {
  if (assertPath(path), path.length === 0)
    return ".";
  var isAbsolute = path.charCodeAt(0) === 47, trailingSeparator = path.charCodeAt(path.length - 1) === 47;
  if (path = normalizeStringPosix(path, !isAbsolute), path.length === 0 && !isAbsolute)
    path = ".";
  if (path.length > 0 && trailingSeparator)
    path += "/";
  if (isAbsolute)
    return "/" + path;
  return path;
}
function isAbsolute(path) {
  return assertPath(path), path.length > 0 && path.charCodeAt(0) === 47;
}
function join() {
  if (arguments.length === 0)
    return ".";
  var joined;
  for (var i = 0;i < arguments.length; ++i) {
    var arg = arguments[i];
    if (assertPath(arg), arg.length > 0)
      if (joined === undefined)
        joined = arg;
      else
        joined += "/" + arg;
  }
  if (joined === undefined)
    return ".";
  return normalize(joined);
}
function relative(from, to) {
  if (assertPath(from), assertPath(to), from === to)
    return "";
  if (from = resolve(from), to = resolve(to), from === to)
    return "";
  var fromStart = 1;
  for (;fromStart < from.length; ++fromStart)
    if (from.charCodeAt(fromStart) !== 47)
      break;
  var fromEnd = from.length, fromLen = fromEnd - fromStart, toStart = 1;
  for (;toStart < to.length; ++toStart)
    if (to.charCodeAt(toStart) !== 47)
      break;
  var toEnd = to.length, toLen = toEnd - toStart, length = fromLen < toLen ? fromLen : toLen, lastCommonSep = -1, i = 0;
  for (;i <= length; ++i) {
    if (i === length) {
      if (toLen > length) {
        if (to.charCodeAt(toStart + i) === 47)
          return to.slice(toStart + i + 1);
        else if (i === 0)
          return to.slice(toStart + i);
      } else if (fromLen > length) {
        if (from.charCodeAt(fromStart + i) === 47)
          lastCommonSep = i;
        else if (i === 0)
          lastCommonSep = 0;
      }
      break;
    }
    var fromCode = from.charCodeAt(fromStart + i), toCode = to.charCodeAt(toStart + i);
    if (fromCode !== toCode)
      break;
    else if (fromCode === 47)
      lastCommonSep = i;
  }
  var out = "";
  for (i = fromStart + lastCommonSep + 1;i <= fromEnd; ++i)
    if (i === fromEnd || from.charCodeAt(i) === 47)
      if (out.length === 0)
        out += "..";
      else
        out += "/..";
  if (out.length > 0)
    return out + to.slice(toStart + lastCommonSep);
  else {
    if (toStart += lastCommonSep, to.charCodeAt(toStart) === 47)
      ++toStart;
    return to.slice(toStart);
  }
}
function _makeLong(path) {
  return path;
}
function dirname(path) {
  if (assertPath(path), path.length === 0)
    return ".";
  var code = path.charCodeAt(0), hasRoot = code === 47, end = -1, matchedSlash = true;
  for (var i = path.length - 1;i >= 1; --i)
    if (code = path.charCodeAt(i), code === 47) {
      if (!matchedSlash) {
        end = i;
        break;
      }
    } else
      matchedSlash = false;
  if (end === -1)
    return hasRoot ? "/" : ".";
  if (hasRoot && end === 1)
    return "//";
  return path.slice(0, end);
}
function basename(path, ext) {
  if (ext !== undefined && typeof ext !== "string")
    throw new TypeError('"ext" argument must be a string');
  assertPath(path);
  var start = 0, end = -1, matchedSlash = true, i;
  if (ext !== undefined && ext.length > 0 && ext.length <= path.length) {
    if (ext.length === path.length && ext === path)
      return "";
    var extIdx = ext.length - 1, firstNonSlashEnd = -1;
    for (i = path.length - 1;i >= 0; --i) {
      var code = path.charCodeAt(i);
      if (code === 47) {
        if (!matchedSlash) {
          start = i + 1;
          break;
        }
      } else {
        if (firstNonSlashEnd === -1)
          matchedSlash = false, firstNonSlashEnd = i + 1;
        if (extIdx >= 0)
          if (code === ext.charCodeAt(extIdx)) {
            if (--extIdx === -1)
              end = i;
          } else
            extIdx = -1, end = firstNonSlashEnd;
      }
    }
    if (start === end)
      end = firstNonSlashEnd;
    else if (end === -1)
      end = path.length;
    return path.slice(start, end);
  } else {
    for (i = path.length - 1;i >= 0; --i)
      if (path.charCodeAt(i) === 47) {
        if (!matchedSlash) {
          start = i + 1;
          break;
        }
      } else if (end === -1)
        matchedSlash = false, end = i + 1;
    if (end === -1)
      return "";
    return path.slice(start, end);
  }
}
function extname(path) {
  assertPath(path);
  var startDot = -1, startPart = 0, end = -1, matchedSlash = true, preDotState = 0;
  for (var i = path.length - 1;i >= 0; --i) {
    var code = path.charCodeAt(i);
    if (code === 47) {
      if (!matchedSlash) {
        startPart = i + 1;
        break;
      }
      continue;
    }
    if (end === -1)
      matchedSlash = false, end = i + 1;
    if (code === 46) {
      if (startDot === -1)
        startDot = i;
      else if (preDotState !== 1)
        preDotState = 1;
    } else if (startDot !== -1)
      preDotState = -1;
  }
  if (startDot === -1 || end === -1 || preDotState === 0 || preDotState === 1 && startDot === end - 1 && startDot === startPart + 1)
    return "";
  return path.slice(startDot, end);
}
function format(pathObject) {
  if (pathObject === null || typeof pathObject !== "object")
    throw new TypeError('The "pathObject" argument must be of type Object. Received type ' + typeof pathObject);
  return _format("/", pathObject);
}
function parse(path) {
  assertPath(path);
  var ret = { root: "", dir: "", base: "", ext: "", name: "" };
  if (path.length === 0)
    return ret;
  var code = path.charCodeAt(0), isAbsolute2 = code === 47, start;
  if (isAbsolute2)
    ret.root = "/", start = 1;
  else
    start = 0;
  var startDot = -1, startPart = 0, end = -1, matchedSlash = true, i = path.length - 1, preDotState = 0;
  for (;i >= start; --i) {
    if (code = path.charCodeAt(i), code === 47) {
      if (!matchedSlash) {
        startPart = i + 1;
        break;
      }
      continue;
    }
    if (end === -1)
      matchedSlash = false, end = i + 1;
    if (code === 46) {
      if (startDot === -1)
        startDot = i;
      else if (preDotState !== 1)
        preDotState = 1;
    } else if (startDot !== -1)
      preDotState = -1;
  }
  if (startDot === -1 || end === -1 || preDotState === 0 || preDotState === 1 && startDot === end - 1 && startDot === startPart + 1) {
    if (end !== -1)
      if (startPart === 0 && isAbsolute2)
        ret.base = ret.name = path.slice(1, end);
      else
        ret.base = ret.name = path.slice(startPart, end);
  } else {
    if (startPart === 0 && isAbsolute2)
      ret.name = path.slice(1, startDot), ret.base = path.slice(1, end);
    else
      ret.name = path.slice(startPart, startDot), ret.base = path.slice(startPart, end);
    ret.ext = path.slice(startDot, end);
  }
  if (startPart > 0)
    ret.dir = path.slice(0, startPart - 1);
  else if (isAbsolute2)
    ret.dir = "/";
  return ret;
}
var sep = "/";
var delimiter = ":";
var posix = ((p) => (p.posix = p, p))({ resolve, normalize, isAbsolute, join, relative, _makeLong, dirname, basename, extname, format, parse, sep, delimiter, win32: null, posix: null });
var path_default = posix;

// src/logging.ts
class Logger {
  dir;
  constructor(dir) {
    this.dir = dir;
  }
  async ensureDir() {
    await fs.mkdir(this.dir, { recursive: true });
  }
  async log(entry) {
    await this.ensureDir();
    const textLine = this.formatText(entry) + `
`;
    const jsonLine = JSON.stringify(this.formatJson(entry)) + `
`;
    await Promise.all([
      fs.appendFile(path_default.join(this.dir, "events.log"), textLine, "utf8"),
      fs.appendFile(path_default.join(this.dir, "events.jsonl"), jsonLine, "utf8")
    ]);
    process.stdout.write(textLine);
  }
  formatText(entry) {
    const ts = entry.worldTime.toISOString();
    const loc = entry.location ? ` @ ${entry.location}` : "";
    const actors = entry.actors?.length ? ` [${entry.actors.join(", ")}]` : "";
    const details = entry.details ? ` — ${entry.details}` : "";
    return `${ts} [${entry.category}]${loc}${actors} ${entry.summary}${details}`;
  }
  formatJson(entry) {
    return {
      ...entry,
      worldTime: entry.worldTime.toISOString(),
      realTime: entry.realTime.toISOString()
    };
  }
}

// src/rng.ts
function hashSeed(seed) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0;i < seed.length; i += 1) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = h << 13 | h >>> 19;
  }
  return h >>> 0 || 1;
}
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = a + 1831565813 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function makeRandom(seed) {
  const rng = mulberry32(hashSeed(seed));
  return {
    next: rng,
    int(maxExclusive) {
      if (maxExclusive <= 1)
        return 0;
      return Math.floor(rng() * maxExclusive);
    },
    pick(items) {
      if (!items.length) {
        throw new Error("Attempted to pick from an empty list.");
      }
      return items[this.int(items.length)];
    },
    chance(probability) {
      if (probability <= 0)
        return false;
      if (probability >= 1)
        return true;
      return rng() < probability;
    },
    shuffle(items) {
      const result = [...items];
      for (let i = result.length - 1;i > 0; i--) {
        const j = this.int(i + 1);
        [result[i], result[j]] = [result[j], result[i]];
      }
      return result;
    }
  };
}

// src/scheduler.ts
class Scheduler {
  bus;
  config;
  interval;
  turnIndex = 0;
  turnIntervalMs;
  constructor(bus, config2) {
    this.bus = bus;
    this.config = config2;
    this.turnIntervalMs = this.config.msPerWorldMinute * this.config.turnMinutes;
  }
  start() {
    if (this.interval)
      return;
    this.interval = setInterval(() => this.emitTurn(), this.turnIntervalMs);
  }
  stop() {
    if (!this.interval)
      return;
    clearInterval(this.interval);
    this.interval = undefined;
  }
  emitTurn() {
    this.turnIndex += 1;
    const worldTime = new Date(this.config.startWorldTime.getTime() + this.turnIndex * this.config.turnMinutes * 60000);
    const tick = { kind: "turn", worldTime, turnIndex: this.turnIndex };
    this.bus.publish(tick);
    if (this.turnIndex % this.config.hourTurns === 0) {
      this.bus.publish({ ...tick, kind: "hour" });
    }
    if (this.turnIndex % (this.config.hourTurns * this.config.dayHours) === 0) {
      this.bus.publish({ ...tick, kind: "day" });
    }
  }
}

// data/names.ts
var FEMALE_NAMES = [
  "Aafte",
  "Aalès",
  "Aalèz",
  "Aalfte",
  "Aalina",
  "Aaline",
  "Aalis",
  "Aaliz",
  "Aaltje",
  "Aanor",
  "Ababilia",
  "Abarne",
  "Abauntza",
  "Abbatissa",
  "Abbelina",
  "Abelie",
  "Abelota",
  "Abte",
  "Acelina",
  "Achaia",
  "Achethe",
  "Achradina",
  "Actaëe",
  "Actë",
  "Ada",
  "Adala",
  "Adalberta",
  "Adaleide",
  "Adalheid",
  "Adalheidis",
  "Adalind",
  "Adalindis",
  "Adaliz",
  "Adallinda",
  "Adallindis",
  "Adalmut",
  "Adalrada",
  "Adaltrude",
  "Adaltrutis",
  "Adaluuidis",
  "Adalwara",
  "Adalwif",
  "Adda",
  "Addela",
  "Ade",
  "Adeia",
  "Adela",
  "Adelaide",
  "Adelaidis",
  "Adelais",
  "Adeldreda",
  "Adelena",
  "Adelheid",
  "Adelheidis",
  "Adelicia",
  "Adelid",
  "Adelie",
  "Adelin",
  "Adelina",
  "Adeline",
  "Adelisa",
  "Adeliz",
  "Adeliza",
  "Adeltrudis",
  "Adelysia",
  "Adeodata",
  "Adere",
  "Adète",
  "Adhela",
  "Adhelina",
  "Adila",
  "Admiranda",
  "Adonie",
  "Adula",
  "Aduna",
  "Adwala",
  "Aebbe",
  "Aedelflete",
  "Aeditha",
  "Aediva",
  "Aedon",
  "Aegiolea",
  "Aegle",
  "Aeileua",
  "Aeilgyuu",
  "Aeldid",
  "Aeldiet",
  "Aeldit",
  "Aeleis",
  "Aelesia",
  "Aelffled",
  "Aelfgiuee",
  "Aelfgiva",
  "Aelfgyd",
  "Aelfled",
  "Aelfleda",
  "Aelfryth",
  "Aelgytha",
  "Aelienor",
  "Aelina",
  "Aelis",
  "Aelisia",
  "Aelive",
  "Aelizia",
  "Aelueua",
  "Aenor",
  "Aerope",
  "Aes",
  "Aeschine",
  "Aetheldreda",
  "Aethelfleada",
  "Aethelind",
  "Aethelinda",
  "Aethelthryth",
  "Aetheria",
  "Aethre",
  "Agace",
  "Agacia",
  "Agacie",
  "Agamede",
  "Aganippe",
  "Agape",
  "Agapia",
  "Agarista",
  "Agas",
  "Agase",
  "Agate",
  "Agatha",
  "Agathé",
  "Agathonice",
  "Agave",
  "Agentrudis",
  "Aggie",
  "Agglethrudis",
  "Aginaga",
  "Agirre",
  "Aglaia",
  "Aglaurus",
  "Agnella",
  "Agnesot",
  "Agneta",
  "Agnetis",
  "Agnus",
  "Agote",
  "Agurne",
  "Agurtzane",
  "Ahelis",
  "Ahelissa",
  "Aiago",
  "Aiala",
  "Aicelina",
  "Aicusa",
  "Aiglante",
  "Aiglente",
  "Aiglentine",
  "Aikaterine",
  "Ailda",
  "Aildreda",
  "Ailed",
  "Aileth",
  "Aileua",
  "Aileve",
  "Ailfled",
  "Ailhiet",
  "Ailid",
  "Ailiet",
  "Ailith",
  "Ailitha",
  "Ailiue",
  "Ailiva",
  "Ailleda",
  "Ailleth",
  "Ailletha",
  "Ailliva",
  "Ailova",
  "Ailufa",
  "Aimie",
  "Ainara",
  "Ainhoa",
  "Ainize",
  "Ainoa",
  "Aintza",
  "Aintzane",
  "Aintzile",
  "Aintzine",
  "Ainuesa",
  "Aiora",
  "Aisone",
  "Aithra",
  "Aitziber",
  "Aizeti",
  "Aizkorri",
  "Aizpea",
  "Aka",
  "Akelda",
  "Akenehi",
  "Aketa",
  "Akorda",
  "Ala",
  "Alaine",
  "Alainne",
  "Alais",
  "Alaitz",
  "Alazaïs",
  "Alazne",
  "Alba",
  "Albelenda",
  "Alberad",
  "Alberadis",
  "Albie",
  "Albizua",
  "Albrad",
  "Albrade",
  "Albray",
  "Albreda",
  "Albree",
  "Albruga",
  "Alburch",
  "Alburg",
  "Alcandre",
  "Alcestis",
  "Alcippe",
  "Alcmene",
  "Alcyone",
  "Alda",
  "Alded",
  "Aldet",
  "Aldeth",
  "Aldgid",
  "Aldguda",
  "Aldgudana",
  "Aldgyth",
  "Aldid",
  "Aldiet",
  "Aldieth",
  "Aldietha",
  "Aldis",
  "Aldith",
  "Alditha",
  "Aldiva",
  "Aldiytha",
  "Aldruth",
  "Alduara",
  "Alduenza",
  "Aldus",
  "Aldusa",
  "Alduse",
  "Aldyet",
  "Aldyt",
  "Aleidis",
  "Aleire",
  "Alemene",
  "Aleneite",
  "Alesandese",
  "Alesia",
  "Alesone",
  "Alesta",
  "Aleusa",
  "Alexandra",
  "Alexandria",
  "Alfgarda",
  "Alfild",
  "Alfled",
  "Alfleda",
  "Alflent",
  "Alflet",
  "Alfleta",
  "Alfreda",
  "Algaia",
  "Algyva",
  "Alhflaed",
  "Alhflead",
  "Alia",
  "Alianor",
  "Alianora",
  "Alice",
  "Alicen",
  "Alicia",
  "Alid",
  "Alienor",
  "Alienora",
  "Alina",
  "Aline",
  "Alis",
  "Alisaundre",
  "Alisceon",
  "Alise",
  "Alison",
  "Alisone",
  "Alisoun",
  "Aliss",
  "Alissende",
  "Alith",
  "Aliua",
  "Aliva",
  "Aliz",
  "Alize",
  "Alkain",
  "Alkmena",
  "Allemande",
  "Allie",
  "Allison",
  "Alma",
  "Almika",
  "Almt",
  "Almuth",
  "Almuza",
  "Aloa",
  "Alodia",
  "Alot",
  "Alote",
  "Alpaida",
  "Alpais",
  "Alse",
  "Alsneta",
  "Alson",
  "Althaea",
  "Althaia",
  "Althea",
  "Altzagarate",
  "Alueua",
  "Alueue",
  "Aluina",
  "Aluinnia",
  "Aluiua",
  "Alverat",
  "Alvered",
  "Alveua",
  "Alveva",
  "Alviua",
  "Alviva",
  "Alycie",
  "Alyna",
  "Alyon",
  "Alys",
  "Alyson",
  "Alysone",
  "Alyva",
  "Ama",
  "Amabil",
  "Amabili",
  "Amabilia",
  "Amabilis",
  "Amabilla",
  "Amabillia",
  "Amable",
  "Amaduena",
  "Amagoia",
  "Amaia",
  "Amalasuintha",
  "Amalberga",
  "Amalberta",
  "Amalbirga",
  "Amalfrida",
  "Amalfriede",
  "Amalgunde",
  "Amalone",
  "Amalur",
  "Amane",
  "Amarhyllis",
  "Amata",
  "Amathea",
  "Amatheia",
  "Amatza",
  "Ambra",
  "Amee",
  "Ameis",
  "Amelia",
  "Amelina",
  "Ameline",
  "Amelinne",
  "Amellia",
  "Amelot",
  "Amelyn",
  "Ameria",
  "Amestrin",
  "Amestris",
  "Amets",
  "Ametza",
  "Amfelice",
  "Amfelisia",
  "Amflis",
  "Amflisa",
  "Amflisia",
  "Amia",
  "Amiable",
  "Amic",
  "Amica",
  "Amicabilis",
  "Amicia",
  "Amicie",
  "Amie",
  "Amilamia",
  "Amilia",
  "Amiot",
  "Amira",
  "Amis",
  "Amiscia",
  "Amisia",
  "Amke",
  "Ammij",
  "Ammio",
  "Ammy",
  "Amoltrud",
  "Amparo",
  "Amphelice",
  "Amphelicia",
  "Amphillis",
  "Amphithoe",
  "Amphitrite",
  "Ampinomene",
  "Amplias",
  "Amulberga",
  "Amuna",
  "Amya",
  "Amycia",
  "Amye",
  "Amyfelyse",
  "Anabel",
  "Anabell",
  "Anabella",
  "Anabill",
  "Anabilla",
  "Anabille",
  "Anabul",
  "Anachorita",
  "Anaeaxi",
  "Anaiansi",
  "Anais",
  "Anastas",
  "Anastase",
  "Anastasia",
  "Anastatia",
  "Anaurra",
  "Anchoret",
  "Anchoretta",
  "Ancret",
  "Ancreta",
  "Ancrett",
  "Ande",
  "Anderazu",
  "Andere",
  "Anderexo",
  "Anderkina",
  "Andia",
  "Andikona",
  "Andion",
  "Andolie",
  "Andone",
  "Andonine",
  "Andre",
  "Andrea",
  "Andregoto",
  "Andrekina",
  "Andremisa",
  "Andreva",
  "Andrezuria",
  "Andrie",
  "Andromeda",
  "Ane",
  "Anès",
  "Anese",
  "Anesot",
  "Anestasia",
  "Anfelisa",
  "Anfelise",
  "Angaret",
  "Angel",
  "Angela",
  "Angelet",
  "Angelu",
  "Angnes",
  "Angnet",
  "Anis",
  "Aniz",
  "Ankerita",
  "Ankharet",
  "Anna",
  "Annabele",
  "Annabell",
  "Annabella",
  "Annabelle",
  "Annable",
  "Annais",
  "Annaple",
  "Annas",
  "Anne",
  "Anneis",
  "Annes",
  "Annestas",
  "Anneyce",
  "Anneys",
  "Anneyse",
  "Annice",
  "Annina",
  "Annis",
  "Annise",
  "Annke",
  "Annor",
  "Annora",
  "Annot",
  "Annys",
  "Anora",
  "Anoz",
  "Ansa",
  "Anselda",
  "Ansere",
  "Ansgard",
  "Ansitruda",
  "Anstes",
  "Anstey",
  "Anstice",
  "Anstis",
  "Anstiss",
  "Anstruda",
  "Antehe",
  "Anteia",
  "Antheia",
  "Anthoinette",
  "Anthousa",
  "Anthusa",
  "Anticleia",
  "Antigone",
  "Antiochis",
  "Antiope",
  "Antipatra",
  "Antje",
  "Antonia",
  "Antxone",
  "Antziasko",
  "Anunciacion",
  "Anyes",
  "Anysia",
  "Anzoy",
  "Apain",
  "Apala",
  "Apeline",
  "Aplin",
  "Apoline",
  "Appa",
  "Applin",
  "Appolina",
  "Appollonia",
  "Apseudes",
  "Araba",
  "Arabella",
  "Arabia",
  "Arable",
  "Aragundia",
  "Araitz",
  "Arama",
  "Arana",
  "Arandon",
  "Arantxa",
  "Arantza",
  "Arantzazu",
  "Aránzazu",
  "Araoz",
  "Arbeiza",
  "Arbekoa",
  "Arbell",
  "Arbella",
  "Arburua",
  "Areagne",
  "Areitio",
  "Areria",
  "Arete",
  "Arethusa",
  "Argeia",
  "Argentea",
  "Argentina",
  "Argi",
  "Argie",
  "Argiloain",
  "Ariadne",
  "Arianna",
  "Arie",
  "Arima",
  "Arisbe",
  "Aristonike",
  "Aristophane",
  "Ariturri",
  "Aritzaga",
  "Aritzeta",
  "Arkija",
  "Arlas",
  "Arlette",
  "Arluzea",
  "Armedaa",
  "Armentaria",
  "Armigil",
  "Armola",
  "Arnaude",
  "Arnotegi",
  "Aroha",
  "Arraitz",
  "Arrako",
  "Arrate",
  "Arrazubi",
  "Arrene",
  "Arreo",
  "Arriaka",
  "Arrieta",
  "Arrigorria",
  "Arriluzea",
  "Arritokieta",
  "Arrixaka",
  "Arrizabalaga",
  "Arrosa",
  "Arsinoe",
  "Artaynta",
  "Artazostra",
  "Artea",
  "Artederreta",
  "Artemidora",
  "Artemisia",
  "Artiga",
  "Artiza",
  "Artizar",
  "Artystone",
  "Artzanegi",
  "Artzeina",
  "Asa",
  "Ascelina",
  "Asceline",
  "Ascelinne",
  "Ascelot",
  "Aschilt",
  "Ascilia",
  "Ashena",
  "Asiturri",
  "Askoa",
  "Aspasia",
  "Asselyna",
  "Assuncion",
  "Astera",
  "Astrid",
  "Astyoche",
  "Astyocheia",
  "Atalanta",
  "Atallo",
  "Atë",
  "Athala",
  "Athanasia",
  "Athela",
  "Athelesia",
  "Atheleys",
  "Athelflead",
  "Athelina",
  "Athelinda",
  "Athelis",
  "Athelisa",
  "Athelisia",
  "Athelyna",
  "Athis",
  "Atilda",
  "Atossa",
  "Atotz",
  "Atsegie",
  "Atxarte",
  "Aua",
  "Auacyn",
  "Auberée",
  "Aubirge",
  "Aubourc",
  "Aubreda",
  "Aubrey",
  "Aude",
  "Audiarda",
  "Audofleda",
  "Audrey",
  "Audry",
  "Audrye",
  "Auekin",
  "Auelin",
  "Auelina",
  "Auelyna",
  "Auge",
  "Augo",
  "Augustina",
  "Auic",
  "Auice",
  "Auicia",
  "Auin",
  "Auina",
  "Auisia",
  "Auizia",
  "Aunflis",
  "Aunphelice",
  "Aurela",
  "Aurelia",
  "Aureliana",
  "Aurelne",
  "Auria",
  "Auriana",
  "Aurildis",
  "Auriol",
  "Auriola",
  "Aurkene",
  "Austie",
  "Austorga",
  "Austrechildis",
  "Autonoe",
  "Auxesia",
  "Ava",
  "Avacyn",
  "Aveis",
  "Avekin",
  "Avelina",
  "Aveline",
  "Avelot",
  "Avelyn",
  "Averell",
  "Averil",
  "Averill",
  "Aveza",
  "Avice",
  "Avicia",
  "Avila",
  "Avilina",
  "Avin",
  "Avina",
  "Avis",
  "Avoca",
  "Avril",
  "Awdrie",
  "Awhina",
  "Axiothea",
  "Axpe",
  "Ayala",
  "Aye",
  "Ayla",
  "Ayled",
  "Ayleth",
  "Aylett",
  "Ayliua",
  "Aylofa",
  "Aylufa",
  "Aylyetta",
  "Ayzebel",
  "Azella",
  "Azitain",
  "Baano",
  "Bab",
  "Babbe",
  "Babcock",
  "Babel",
  "Babesne",
  "Babeth",
  "Babetta",
  "Babitt",
  "Bable",
  "Babs",
  "Badelota",
  "Badia",
  "Baiakua",
  "Bakarne",
  "Bakene",
  "Baldechildis",
  "Balere",
  "Baltelda",
  "Balthechildis",
  "Balthildis",
  "Bar",
  "Barazorda",
  "Barbara",
  "Barbary",
  "Barbata",
  "Barbe",
  "Barber",
  "Barberella",
  "Barberry",
  "Barbery",
  "Barbeta",
  "Barbetta",
  "Barbie",
  "Barbot",
  "Barbota",
  "Barria",
  "Barrika",
  "Barsine",
  "Bartholomette",
  "Bartje",
  "Basaba",
  "Basagaitz",
  "Basalgo",
  "Basandre",
  "Basiane",
  "Basilea",
  "Basilia",
  "Basilie",
  "Basilina",
  "Basill",
  "Basilla",
  "Basille",
  "Basina",
  "Bassilly",
  "Baucis",
  "Baudegundis",
  "Baufte",
  "Bauin",
  "Bauke",
  "Bausanne",
  "Bauteut",
  "Bava",
  "Bavacin",
  "Bavin",
  "Bea",
  "Beat",
  "Beatasis",
  "Beaten",
  "Beatrice",
  "Beatricia",
  "Beatricie",
  "Beatricis",
  "Beatrix",
  "Béatriz",
  "Beattie",
  "Beatty",
  "Beautrice",
  "Bechte",
  "Becke",
  "Becok",
  "Bedaio",
  "Bedeluue",
  "Bee",
  "Begga",
  "Begoa",
  "Begona",
  "Belanda",
  "Belaskita",
  "Belate",
  "Belegardis",
  "Bellisente",
  "Beloke",
  "Beltzane",
  "Bena",
  "Bencelina",
  "Benet",
  "Bengoa",
  "Bengoara",
  "Bengolarrea",
  "Benigna",
  "Bennitt",
  "Benoite",
  "Beraza",
  "Berberana",
  "Berehta",
  "Berenda",
  "Berenga",
  "Berengaria",
  "Bérengère",
  "Berenike",
  "Berezi",
  "Bergard",
  "Bergundis",
  "Berhta",
  "Beriungis",
  "Berna",
  "Bernadette",
  "Bernewief",
  "Bernewif",
  "Berta",
  "Bertaida",
  "Berte",
  "Bertha",
  "Berthildis",
  "Berthlenda",
  "Bertildis",
  "Bertliana",
  "Bertrada",
  "Bertruda",
  "Bertswinda",
  "Berzijana",
  "Bete",
  "Betiko",
  "Betisa",
  "Betje",
  "Betlindis",
  "Beton",
  "Betrice",
  "Betrys",
  "Betryse",
  "Betteresse",
  "Bettin",
  "Bettina",
  "Bettrice",
  "Bettris",
  "Bettrys",
  "Betune",
  "Bianca",
  "Bibie",
  "Bidane",
  "Biddy",
  "Biedeluue",
  "Biétris",
  "Biétrix",
  "Biétriz",
  "Biétron",
  "Bihotz",
  "Bikarregi",
  "Bilda",
  "Bingene",
  "Binhildis",
  "Biolarra",
  "Bioti",
  "Bito",
  "Bittore",
  "Bittori",
  "Bitxi",
  "Bitxilore",
  "Bixenta",
  "Bizkaia",
  "Bizkargi",
  "Blanch",
  "Blanchette",
  "Blanchia",
  "Blaunche",
  "Blench",
  "Blissot",
  "Blitekin",
  "Blitha",
  "Blonde",
  "Bobila",
  "Boime",
  "Boke",
  "Boltiarda",
  "Bonajoia",
  "Bonassias",
  "Bonne",
  "Bonoque",
  "Bore",
  "Boukje",
  "Bova",
  "Boviardis",
  "Bragwayn",
  "Brangwayna",
  "Brangwine",
  "Branwyne",
  "Braya",
  "Brechtje",
  "Bride",
  "Bridget",
  "Brigette",
  "Brigida",
  "Brigit",
  "Brigitta",
  "Brise",
  "Briseis",
  "Brune",
  "Brunehaut",
  "Brunisente",
  "Brunissende",
  "Bryde",
  "Buiondo",
  "Burgondo",
  "Burgundefara",
  "Burtzea",
  "Bytzel",
  "Byzantia",
  "Caenis",
  "Caesaria",
  "Caleope",
  "Calla",
  "Callianeira",
  "Callianessa",
  "Calliphana",
  "Calypso",
  "Camilla",
  "Campana",
  "Canace",
  "Candida",
  "Carmel",
  "Cassander",
  "Cassandre",
  "Cassandry",
  "Casse",
  "Castianiera",
  "Catarine",
  "Catel",
  "Catelin",
  "Cateline",
  "Catella",
  "Catelot",
  "Caterina",
  "Caterine",
  "Catering",
  "Catharine",
  "Catherine",
  "Catherne",
  "Catin",
  "Catlin",
  "Caton",
  "Catrina",
  "Cattern",
  "Cattle",
  "Cecely",
  "Cecelya",
  "Cecelyna",
  "Cecil",
  "Cecili",
  "Cecilia",
  "Cecilie",
  "Cecille",
  "Cecillia",
  "Cecy",
  "Ceday",
  "Celestine",
  "Celestria",
  "Celia",
  "Celina",
  "Cervella",
  "Cesarea",
  "Chantal",
  "Charis",
  "Charito",
  "Charity",
  "Childebertana",
  "Chione",
  "Chiore",
  "Chloe",
  "Chloë",
  "Chloris",
  "Chlotichhilda",
  "Chlotsuintha",
  "Chrisoogone",
  "Christina",
  "Chryse",
  "Chryseida",
  "Chryseis",
  "Chrysothemis",
  "Chuna",
  "Chunegundis",
  "Chydleluve",
  "Cicely",
  "Cicilia",
  "Cicily",
  "Cilia",
  "Cilissa",
  "Cilla",
  "Circe",
  "Cisse",
  "Cissie",
  "Cissota",
  "Clamancia",
  "Clara",
  "Clarae",
  "Claramunda",
  "Clarcia",
  "Clarell",
  "Claremonde",
  "Clariandra",
  "Claribel",
  "Clarice",
  "Claricia",
  "Claricie",
  "Clarimond",
  "Clariscia",
  "Clarissa",
  "Clarisse",
  "Claritia",
  "Clarrie",
  "Clarry",
  "Clarugge",
  "Clemencia",
  "Clemency",
  "Clemenicia",
  "Clemens",
  "Clementia",
  "Clementina",
  "Clementine",
  "Cler",
  "Cleremunda",
  "Clericia",
  "Climence",
  "Clio",
  "Clodauuiua",
  "Clothild",
  "Clotrada",
  "Clymence",
  "Clymene",
  "Clymere",
  "Colecta",
  "Coleite",
  "Colet",
  "Coleta",
  "Colète",
  "Colett",
  "Coletta",
  "Colina",
  "Colleite",
  "Collette",
  "Colubra",
  "Columba",
  "Comito",
  "Concepcion",
  "Condors",
  "Conegont",
  "Conegundis",
  "Conegunt",
  "Consolantia",
  "Constancia",
  "Constantia",
  "Constantina",
  "Constanza",
  "Contzel",
  "Corinne",
  "Corythia",
  "Coulombe",
  "Crapahildis",
  "Cratais",
  "Cresseid",
  "Cressid",
  "Creusa",
  "Crisa",
  "Criseida",
  "Criseyde",
  "Cristehildis",
  "Cristemburga",
  "Cristemia",
  "Cristyne",
  "Ctimene",
  "Cunegund",
  "Cunegundis",
  "Cus",
  "Cuss",
  "Cussata",
  "Cust",
  "Custa",
  "Custanc",
  "Custance",
  "Custancia",
  "Custans",
  "Custe",
  "Custins",
  "Cvenild",
  "Cybele",
  "Cycalye",
  "Cycly",
  "Cydippe",
  "Cymodoce",
  "Cymothoe",
  "Cyneburga",
  "Cyniburg",
  "Cyra",
  "Cyrene",
  "Cyrilla",
  "Cythereia",
  "Cytheris",
  "Dadin",
  "Dagarada",
  "Damaris",
  "Damaspia",
  "Dameta",
  "Dametta",
  "Damia",
  "Damiane",
  "Damisona",
  "Danaë",
  "Danburga",
  "Dania",
  "Darklis",
  "dear/beloved",
  "Decima",
  "Deianeira",
  "Deineira",
  "Deio",
  "Deiphobe",
  "Deipyle",
  "Delias",
  "Deloys",
  "Demetria",
  "Demophile",
  "Demuth",
  "Denis",
  "Dennet",
  "Denote",
  "Deonisia",
  "Deonysia",
  "Desdemona",
  "Desiderata",
  "Desirata",
  "Destasia",
  "Dever",
  "Dexamene",
  "Diamanda",
  "Diana",
  "Dianeme",
  "Dido",
  "Didyma",
  "Diene",
  "Dilli",
  "Dillo",
  "Dinae",
  "Dinah",
  "Diomede",
  "Dione",
  "Dionis",
  "Dionisia",
  "Dionycia",
  "Dionysia",
  "Diot",
  "Diota",
  "Dirce",
  "Dirtje",
  "Disdemona",
  "Distira",
  "Doda",
  "Dodda",
  "Dodie",
  "Dodo",
  "Dolichena",
  "Doll",
  "Dolly",
  "Dolore",
  "Dolores",
  "Doltza",
  "Domeka",
  "Domentzia",
  "Dominica",
  "Dominixe",
  "Dominy",
  "Domnica",
  "Domnola",
  "Donada",
  "Donata",
  "Donetzine",
  "Doniantsu",
  "Donianzu",
  "Donnet",
  "Dora",
  "Dorate",
  "Dorathea",
  "Dorathia",
  "Dorcas",
  "Dorée",
  "Doreen",
  "Dorette",
  "Doria",
  "Doris",
  "Dorleta",
  "Dorothea",
  "Dorthy",
  "Dorythye",
  "Dot",
  "Dota",
  "Dothy",
  "Doto",
  "Dottie",
  "Douce",
  "Doue",
  "Dousabel",
  "Dousable",
  "Douset",
  "Dousin",
  "Douze",
  "Dowsabel",
  "Dowse",
  "Dowzable",
  "Drosis",
  "Drueta",
  "Drusilla",
  "Drypetis",
  "Duce",
  "Duda",
  "Dulanto",
  "Dulcia",
  "Dulcibella",
  "Dulcie",
  "Dulcinea",
  "Duleia",
  "Dunixe",
  "Durilda",
  "Dusa",
  "Dussabel",
  "Dussabele",
  "Duszabell",
  "Duua",
  "Duva",
  "Duze",
  "Dyana",
  "Dynamene",
  "Dyonisia",
  "Dyonisya",
  "Dyot",
  "Dyota",
  "Ead",
  "Eadburga",
  "Eadgithu",
  "Eadgyth",
  "Eadgytha",
  "Eadida",
  "Eadie",
  "Eadita",
  "Eadu",
  "Earthelinda",
  "Eberhild",
  "Ebertana",
  "Eburhild",
  "Eburhilt",
  "Eda",
  "Edan",
  "Edborough",
  "Edburga",
  "Edda",
  "Edde",
  "Edden",
  "Eddiva",
  "Eddiz",
  "Eddusa",
  "Ede",
  "Edeberga",
  "Edeborg",
  "Eded",
  "Edekin",
  "Edelin",
  "Edelina",
  "Edeline",
  "Edelinne",
  "Edelot",
  "Eden",
  "Ederne",
  "Ederra",
  "Edeua",
  "Edeva",
  "Edged",
  "Edgida",
  "Edgidia",
  "Edgyth",
  "Edgyue",
  "Edhida",
  "Edhiva",
  "Edid",
  "Edied",
  "Ediet",
  "Edihe",
  "Edila",
  "Edine",
  "Edit",
  "Editha",
  "Edithe",
  "Ediua",
  "Ediva",
  "Ediz",
  "Edney",
  "Edolina",
  "Edon",
  "Edonea",
  "Edony",
  "Edume",
  "Edurne",
  "Edurtzeta",
  "Edus",
  "Edy",
  "Edytha",
  "Edyva",
  "Effam",
  "Effemy",
  "Effie",
  "Effim",
  "Effum",
  "Eflead",
  "Ega",
  "Egecin",
  "Egelina",
  "Egeluuara",
  "Egeria",
  "Egesburga",
  "Egesloga",
  "Egiarte",
  "Egilior",
  "Egina",
  "Eglantine",
  "Eglentina",
  "Eglentine",
  "Eguene",
  "Eguzki",
  "Eguzkie",
  "Ehgelhild",
  "Ehgeluuara",
  "Eider",
  "Eidita",
  "Eidothee",
  "Eilaria",
  "Eileithyia",
  "Eileua",
  "Eileue",
  "Eileve",
  "Eilieue",
  "Eimde",
  "Ejte",
  "Ekhie",
  "Ela",
  "Elaia",
  "Elaine",
  "Elaisse",
  "Elana",
  "Elaria",
  "Elayne",
  "Elcmene",
  "Eldid",
  "Eldit",
  "Elduara",
  "Eleanora",
  "Electra",
  "Elen",
  "Elena",
  "Elene",
  "Eleua",
  "Elewisa",
  "Elewys",
  "Eleyn",
  "Eleyne",
  "Elfgifu",
  "Elflet",
  "Elfleta",
  "Elfred",
  "Elfrid",
  "Elfrida",
  "Elftrudis",
  "Elgiva",
  "Elia",
  "Elianor",
  "Elianora",
  "Elicia",
  "Elin",
  "Elinor",
  "Elinora",
  "Elisabete",
  "Elison",
  "Elisot",
  "Elisota",
  "Elixabete",
  "Elixane",
  "Elizabeth",
  "Elizamendi",
  "Elizmendi",
  "Elkano",
  "Ella",
  "Ellaire",
  "Ellen",
  "Ellene",
  "Ellenor",
  "Ellerete",
  "Ellice",
  "Ellie",
  "Ellin",
  "Ellot",
  "Ellota",
  "Ellyn",
  "Elmerich",
  "Eloisa",
  "Eloise",
  "Elorriaga",
  "Elota",
  "Elpir",
  "Else",
  "Elsebeth",
  "Elske",
  "Elueua",
  "Eluiua",
  "Eluiue",
  "Eluned",
  "Elurreta",
  "Eluska",
  "Eluyua",
  "Elveva",
  "Elvina",
  "Elwisia",
  "Elyenora",
  "Elyne",
  "Elysande",
  "Elysant",
  "Elyscia",
  "Ema",
  "Emayn",
  "Emblem",
  "Emblema",
  "Emblen",
  "Emblin",
  "Emblyn",
  "Emecin",
  "Emelenine",
  "Emelin",
  "Emelina",
  "Emeline",
  "Emelisse",
  "Emelnie",
  "Emelot",
  "Emelote",
  "Emeloth",
  "Emeludt",
  "Emelye",
  "Emelyn",
  "Emelyne",
  "Emengar",
  "Emenjart",
  "Emeny",
  "Emeria",
  "Emerita",
  "Emerlee",
  "Emersende",
  "Emery",
  "Emilia",
  "Emlin",
  "Emlyn",
  "Emm",
  "Emma",
  "Emmanaia",
  "Emme",
  "Emmelina",
  "Emmeline",
  "Emmet",
  "Emmete",
  "Emmony",
  "Emmot",
  "Emmota",
  "Emmote",
  "Emoni",
  "Emonie",
  "Emony",
  "Emota",
  "Emulea",
  "Emy",
  "Emylyna",
  "Enara",
  "Encarnacion",
  "Endeis",
  "Endera",
  "Enea",
  "Eneka",
  "Eneritz",
  "Engelberga",
  "Engelgard",
  "Engelsuit",
  "Engeluuara",
  "Engelwara",
  "Engle",
  "Enmeline",
  "Enna",
  "Enota",
  "Enyo",
  "Eormengard",
  "Eormengild",
  "Eos",
  "Epham",
  "Epicaste",
  "Epicelena",
  "Epiphania",
  "Eppie",
  "Erchantrudis",
  "Erchembrog",
  "Erdaie",
  "Erdie",
  "Erdoitza",
  "Erdotza",
  "Erdoza",
  "Ereleuva",
  "Erelieva",
  "Erembour",
  "Erembourc",
  "Eremburgis",
  "Ereprad",
  "Erguia",
  "Eriboea",
  "Erica",
  "Eriete",
  "Erigone",
  "Erika",
  "Eriopis",
  "Eriphyle",
  "Eris",
  "Erisenda",
  "Erkembrog",
  "Erkenbrog",
  "Erkenburoc",
  "Erkenrad",
  "Erkuden",
  "Erlea",
  "Erma",
  "Ermandrud",
  "Ermbourg",
  "Ermecin",
  "Ermegarde",
  "Ermegardis",
  "Ermengard",
  "Ermengarda",
  "Ermengarde",
  "Ermengardis",
  "Ermengart",
  "Ermenjart",
  "Ermentrudis",
  "Ermessenda",
  "Ermeswindis",
  "Ermie",
  "Ermin",
  "Ermina",
  "Ermingard",
  "Erminia",
  "Ermisenda",
  "Ermua",
  "Ernio",
  "Erniobe",
  "Erpsuid",
  "Erramune",
  "Erramusa",
  "Errasti",
  "Erregina",
  "Erremulluri",
  "Errictruda",
  "Errita",
  "Erromane",
  "Errosali",
  "Erroz",
  "Errukine",
  "Erta",
  "Esa",
  "Eschina",
  "Eschiva",
  "Esclairmonde",
  "Esclamonde",
  "Esclarmonde",
  "Esdeline",
  "Eskarne",
  "Eskolunbe",
  "Esozi",
  "Esperte",
  "Espoz",
  "Esquiva",
  "Essylt",
  "Estebeni",
  "Estibalitz",
  "Estibaliz",
  "Estienne",
  "Estrangia",
  "Estrelda",
  "Estrilda",
  "Estrildis",
  "Estrill",
  "Estrilld",
  "Etfled",
  "Ethel",
  "Ethelchif",
  "Etheldred",
  "Etheldritha",
  "Ethelenda",
  "Ethelgard",
  "Ethelgarda",
  "Ethelia",
  "Etorne",
  "Etxano",
  "Etxauarren",
  "Eucarpia",
  "Eudeline",
  "Eudocia",
  "Eudokia",
  "Eudoxia",
  "Eue",
  "Euerloga",
  "Eufamie",
  "Eufemia",
  "Eufemie",
  "Eufemma",
  "Eufemme",
  "Eufemmia",
  "Eufiama",
  "Eufrata",
  "Eugenia",
  "Eulari",
  "Eularia",
  "Eunate",
  "Eunice",
  "Eunisia",
  "Euodias",
  "Eupham",
  "Euphame",
  "Eupheme",
  "Euphemia",
  "Euphrasia",
  "Euphro",
  "Euphrosyne",
  "Euria",
  "Eurildis",
  "Eurohildis",
  "Europa",
  "Eurycleia",
  "Eurydike",
  "Eurynome",
  "Eusa",
  "Eusebia",
  "Eustachia",
  "Eustacia",
  "Evadne",
  "Evantia",
  "Evelina",
  "Evelyn",
  "Evemy",
  "Everelda",
  "Evereldis",
  "Everild",
  "Everilda",
  "Everildis",
  "Everill",
  "Evfemia",
  "Ewfame",
  "Extranea",
  "Ezkurra",
  "Ezozia",
  "Eztegune",
  "Fabia",
  "Fabiana",
  "Fabiola",
  "Fabrisse",
  "Fara",
  "Farahilda",
  "Fastrada",
  "Fede",
  "Feentje",
  "Feike",
  "Felica",
  "Felice",
  "Felicia",
  "Felis",
  "Felise",
  "Felisia",
  "Femmota",
  "Fermina",
  "Fieke",
  "Filisia",
  "Fillida",
  "Fillon",
  "Fillys",
  "Fina",
  "Finepopla",
  "Flavia",
  "Fleurie",
  "Flo",
  "Flora",
  "Flore",
  "Florence",
  "Florencia",
  "Florentia",
  "Florentxi",
  "Floria",
  "Florie",
  "Florina",
  "Florion",
  "Florymonde",
  "Floss",
  "Flossie",
  "Flouerana",
  "Flour",
  "Flourie",
  "Flur",
  "Flurekin",
  "Fluri",
  "Focktje",
  "Folclind",
  "Folclinda",
  "Folcrada",
  "Folcuuara",
  "Folgarda",
  "Folsuindis",
  "Folsuuendis",
  "Fordola",
  "Fortlifh",
  "Fortunata",
  "Fousafia",
  "Foy",
  "Francesca",
  "Francesse",
  "Francis",
  "Franqueite",
  "Frantsesa",
  "Frantxa",
  "Frantziska",
  "Frauuara",
  "Freadeyweed",
  "Fredeburgis",
  "Fredegonde",
  "Frederada",
  "Fredeuuara",
  "Frediswitha",
  "Frethegard",
  "Frethesuinda",
  "Frethesuindis",
  "Fridayweed",
  "Fridegundis",
  "Fridesuenda",
  "Frideswid",
  "Fridewiga",
  "Fridiswed",
  "Fridiswid",
  "Fridswed",
  "Frisburgis",
  "Frithelinda",
  "Frithswith",
  "Frouuin",
  "Frouuina",
  "Fruitutsu",
  "Fryswyde",
  "Fye",
  "Gaatha",
  "Gabone",
  "Gabrielia",
  "Gace",
  "Gadea",
  "Gaenor",
  "Gailan",
  "Gailana",
  "Gaillarde",
  "Gainko",
  "Galatea",
  "Galiene",
  "Galienne",
  "Ganleya",
  "Ganor",
  "Garaie",
  "Garaitz",
  "Garazi",
  "Garbi",
  "Garbie",
  "Garbikunde",
  "Garbine",
  "Garden",
  "Gardotza",
  "Garoa",
  "Garralda",
  "Garrastazu",
  "Garthrite",
  "Gartrett",
  "Gartrite",
  "Gartrude",
  "Gartzene",
  "Gatty",
  "Gatzarieta",
  "Gaude",
  "Gaunlaya",
  "Gaunliena",
  "Gauzia",
  "Gaxi",
  "Gaxuxa",
  "Gaynore",
  "Gazelu",
  "Gazeta",
  "Gaztain",
  "Geaxi",
  "Gebke",
  "Geelte",
  "Geerta",
  "Geertje",
  "Geertke",
  "Geila",
  "Gelduuara",
  "Gele",
  "Gelen",
  "Gelleia",
  "Gemma",
  "Geneva",
  "Genevieve",
  "Genofeva",
  "Gentile",
  "Gentzane",
  "Georgia",
  "Geraxane",
  "Gerbaga",
  "Gerberga",
  "Gerburg",
  "Geredrudis",
  "Geretrudis",
  "Gerharde",
  "Gerhild",
  "Gerlent",
  "Gerlinda",
  "Germainne",
  "Germana",
  "Geroa",
  "Gersenda",
  "Gersendis",
  "Gersuenda",
  "Gersuinda",
  "Gersvinda",
  "Gert",
  "Gertie",
  "Gertje",
  "Gertrud",
  "Gertruda",
  "Gertrudis",
  "Gerty",
  "Geruuara",
  "Gesa",
  "Geske",
  "Gethrude",
  "Geua",
  "Geue",
  "Geuecok",
  "Geva",
  "Gileite",
  "Gilète",
  "Gilia",
  "Giliana",
  "Giliane",
  "Gill",
  "Gille",
  "Gilleis",
  "Gilleite",
  "Gillian",
  "Gillie",
  "Gillot",
  "Gillota",
  "Gilly",
  "Ginnade",
  "Giona",
  "Gipuzkoa",
  "Giraude",
  "Gisela",
  "Gisella",
  "Giselle",
  "Gisellee",
  "Gisila",
  "Gisla",
  "Gismon",
  "Giso",
  "Gixane",
  "Gladuse",
  "Glauce",
  "Glismoda",
  "Glismodis",
  "Glyke",
  "Godalinda",
  "Godeca",
  "Godecin",
  "Godefe",
  "Godelda",
  "Godeleve",
  "Godelif",
  "Godelinda",
  "Godeliva",
  "Godelive",
  "Godeue",
  "Godeva",
  "Godgeua",
  "Godgiua",
  "Godgiva",
  "Godid",
  "Godildis",
  "Godise",
  "Godit",
  "Goditha",
  "Godiuia",
  "Godleue",
  "Godleva",
  "Goduia",
  "Godusa",
  "Goduse",
  "Goduuara",
  "Godyf",
  "Goiatz",
  "Goikiria",
  "Goikoana",
  "Goiuria",
  "Goizane",
  "Goizargi",
  "Goldeheve",
  "Goldgeofu",
  "Goldgeve",
  "Goldhuie",
  "Goldyeua",
  "Goldyeue",
  "Goldyva",
  "Goldyve",
  "Golla",
  "Gonilda",
  "Gonnild",
  "Gonnilda",
  "Gonnora",
  "Gonora",
  "Gonore",
  "Goodeth",
  "Goodeve",
  "Goodife",
  "Gorane",
  "Goratze",
  "Gordia",
  "Gordiana",
  "Gorgo",
  "Gorostitza",
  "Gorria",
  "Gorritiz",
  "Gorriza",
  "Gothuuera",
  "Goto",
  "Gotzone",
  "Gozo",
  "Grace",
  "Gracia",
  "Gracye",
  "Graeca",
  "Gratianne",
  "Graxi",
  "Grazide",
  "Grece",
  "Grecia",
  "Grecie",
  "Grede",
  "Gredechin",
  "Gregoria",
  "Gresilda",
  "Greta",
  "Grete",
  "Gretje",
  "Gricia",
  "Grietje",
  "Grimuuara",
  "Grisegond",
  "Grisel",
  "Griseldis",
  "Grishild",
  "Grisigion",
  "Grisogonia",
  "Grissall",
  "Grissecon",
  "Grissel",
  "Grissell",
  "Grizel",
  "Grizzel",
  "Guanor",
  "Guda",
  "Gude",
  "Gudeliva",
  "Gudula",
  "Gudule",
  "Gudytha",
  "Gueanor",
  "Guener",
  "Guenevere",
  "Guiborc",
  "Guibourc",
  "Guillemete",
  "Guillemette",
  "Guillote",
  "Guiote",
  "Gumhild",
  "Gundesvinda",
  "Gundichild",
  "Gundiperga",
  "Gundrada",
  "Gundrea",
  "Gunel",
  "Gunild",
  "Gunilda",
  "Gunne",
  "Gunnell",
  "Gunneuare",
  "Gunnild",
  "Gunnilda",
  "Gunnilde",
  "Gunnildes",
  "Gunnilla",
  "Gunnilt",
  "Gunnora",
  "Gunnore",
  "Gunnota",
  "Gunnote",
  "Gunora",
  "Gunwar",
  "Gunware",
  "Guodhelda",
  "Guodlia",
  "Gure",
  "Gurutze",
  "Gurutzeta",
  "Guruzne",
  "Gwenhevare",
  "Gwenore",
  "Gyel",
  "Gygaea",
  "Gylle",
  "Gyly",
  "Gynuara",
  "Gyszel",
  "Hadaken",
  "Hadewidis",
  "Hadwis",
  "Hadwisa",
  "Hadwise",
  "Haidee",
  "Haize",
  "Halie",
  "Hana",
  "Hanneli",
  "Hanni",
  "Haouys",
  "Haoys",
  "Harbona",
  "Harmke",
  "Harmodias",
  "Harmonia",
  "Harriet",
  "Harsent",
  "Harwara",
  "Haueis",
  "Haurramari",
  "Haute",
  "Havisa",
  "Hawis",
  "Hawisa",
  "Hawise",
  "Hawisia",
  "Hawys",
  "Hawyse",
  "Hazeca",
  "Hecuba",
  "Hedewigis",
  "Hedheue",
  "Hegazti",
  "Hegelina",
  "Heidi",
  "Heidindrudis",
  "Heilewif",
  "Heilewis",
  "Heilewisa",
  "Heilswinda",
  "Hekabe",
  "Hekaline",
  "Hekate",
  "Helchen",
  "Heldeburga",
  "Hele",
  "Heleanor",
  "Helena",
  "Helene",
  "Heletradana",
  "Heleuuidis",
  "Helevisa",
  "Helewidis",
  "Helewis",
  "Helewisa",
  "Helewise",
  "Helewys",
  "Helewyse",
  "Heleyne",
  "Helga",
  "Helice",
  "Helike",
  "Helinda",
  "Heliodora",
  "Helis",
  "Helisende",
  "Helisent",
  "Helissent",
  "Helissente",
  "Hellanike",
  "Helle",
  "Helmech",
  "Helmet",
  "Helmeth",
  "Heloise",
  "Helouys",
  "Heloys",
  "Heloyson",
  "Heltrada",
  "Helueua",
  "Helvynya",
  "Helysoune",
  "Helyssent",
  "Hema",
  "Hemin",
  "Hemke",
  "Hengelsenda",
  "Heni",
  "Herden",
  "Herdin",
  "Herena",
  "Herenborg",
  "Herenfrida",
  "Herleva",
  "Herleve",
  "Herlinda",
  "Herlindis",
  "Hermana",
  "Hermelinda",
  "Hermengarda",
  "Hermengart",
  "Hermenjart",
  "Hermesent",
  "Hermessent",
  "Hermine",
  "Hermineite",
  "Hermione",
  "Herophile",
  "Hersent",
  "Hesione",
  "Hesse",
  "Hesychia",
  "Hette",
  "Hextilda",
  "Hiart",
  "Hida",
  "Hiemke",
  "Hientje",
  "Hilaera",
  "Hilargi",
  "Hildberta",
  "Hildborg",
  "Hildcardis",
  "Hilde",
  "Hildeberga",
  "Hildeburg",
  "Hildeburgis",
  "Hildegard",
  "Hildegarde",
  "Hildegardis",
  "Hildegund",
  "Hildelana",
  "Hildemunda",
  "Hildeswindis",
  "Hildeth",
  "Hildeuuara",
  "Hildeuuif",
  "Hildewara",
  "Hildewif",
  "Hildeyerd",
  "Hildiard",
  "Hilditha",
  "Hildithe",
  "Hildrada",
  "Hildwara",
  "Hildyard",
  "Hiliard",
  "Hilith",
  "Hilka",
  "Hilke",
  "Hillaria",
  "Hillda",
  "Hille",
  "Hiltrude",
  "Hinauri",
  "Hine",
  "Hinemoa",
  "Hinte",
  "Hippodameia",
  "Hippodamia",
  "Hippolyta",
  "Hira",
  "Hirmenlind",
  "Hismena",
  "Hodiern",
  "Hodierna",
  "Hodierne",
  "Hoki",
  "Honnor",
  "Honor",
  "Honorata",
  "Honorée",
  "Honorète",
  "Honoria",
  "Honors",
  "Horenga",
  "Hostaruuara",
  "Houdée",
  "Hruodgarda",
  "Hruotberta",
  "Hua",
  "Hugolinae",
  "Hugone",
  "Huguete",
  "Huguette",
  "Hunila",
  "Hursell",
  "Hutaosa",
  "Hylda",
  "Hylde",
  "Hyldeiard",
  "Hyolent",
  "Hypsipyle",
  "Hyrmina",
  "Hysode",
  "Hyssmaye",
  "Iaera",
  "Iaione",
  "Ianeira",
  "Ianessa",
  "Ianthe",
  "Ianuaria",
  "Ibabe",
  "Ibane",
  "Ibernalo",
  "Ibone",
  "Ida",
  "Idasgarda",
  "Ide",
  "Idemay",
  "Ideny",
  "Ideslef",
  "Idesuuif",
  "Ideswif",
  "Idisiardis",
  "Idoia",
  "Idoibaltzaga",
  "Idone",
  "Idonia",
  "Idony",
  "Idurre",
  "Iera",
  "Igaratza",
  "Igone",
  "Igotz",
  "Ihintza",
  "Ikerne",
  "Ikomar",
  "Ikuska",
  "Ilaria",
  "Ilazkie",
  "Ilene",
  "Ilia",
  "Iligardia",
  "Illaria",
  "Iloz",
  "Imagantia",
  "Imaigne",
  "Imania",
  "Imanie",
  "Imayn",
  "Imayne",
  "Imblen",
  "Imedia",
  "Imelda",
  "Imeyna",
  "Imicina",
  "Imma",
  "Imme",
  "Immine",
  "Imte",
  "Imyne",
  "Infe",
  "Ingaret",
  "Ingaretta",
  "Ingela",
  "Ingelswindis",
  "Ingeltrude",
  "Ingeltrudis",
  "Ingeluuara",
  "Ingelwara",
  "Ingerith",
  "Ingrede",
  "Inmaculada",
  "Ino",
  "Ioar",
  "Iodberta",
  "Iola",
  "Iolanthe",
  "Iole",
  "Iolitha",
  "Iomene",
  "Ione",
  "Ionna",
  "Ionnia",
  "Ionnina",
  "Iphianassa",
  "Iphigenia",
  "Iphimedeia",
  "Iphis",
  "Iphitheme",
  "Ipuza",
  "Iragarte",
  "Iraia",
  "Irakusne",
  "Irantzu",
  "Irati",
  "Iratxe",
  "Irene",
  "Iriberri",
  "Iride",
  "Irihapeti",
  "Iris",
  "Iristain",
  "Iriuela",
  "Irmele",
  "Irmengard",
  "Irmenhild",
  "Irmenlind",
  "Irua",
  "Irune",
  "Iruri",
  "Irutxeta",
  "Isa",
  "Isadora",
  "Isamaya",
  "Isard",
  "Isasi",
  "Isata",
  "Isaut",
  "Isburch",
  "Iseldis",
  "Iselota",
  "Isemay",
  "Isemeine",
  "Iseuda",
  "Iseult",
  "Iseut",
  "Ismanna",
  "Ismeina",
  "Ismena",
  "Ismene",
  "Ismenia",
  "Ismey",
  "Isold",
  "Isolde",
  "Isolt",
  "Isot",
  "Isota",
  "Isott",
  "Isotta",
  "Isouda",
  "Issa",
  "Issat",
  "Isurieta",
  "Isylte",
  "Italia",
  "Italica",
  "Itoiz",
  "Itsasne",
  "Itsaso",
  "Iturrieta",
  "Iturrisantu",
  "Itxaro",
  "Itxaso",
  "Itzal",
  "Itzia",
  "Itziar",
  "Iuetta",
  "Iuette",
  "Iuliana",
  "Iuotte",
  "Iurre",
  "Iustina",
  "Ivetta",
  "Ivette",
  "Ixone",
  "Izaga",
  "Izar",
  "Izaro",
  "Izaskun",
  "Izazkun",
  "Izett",
  "Izorne",
  "Izot",
  "Jacotte",
  "Jaione",
  "Jantje",
  "Jasone",
  "Jauregi",
  "Jehanne",
  "Jeike",
  "Jeliana",
  "Jellfte",
  "Jelyan",
  "Jenefer",
  "Jeneuer",
  "Jenningtje",
  "Jeromia",
  "Jervaise",
  "Jesmaine",
  "Jesmond",
  "Jessamine",
  "Jessimond",
  "Jesusa",
  "Jezebel",
  "Jilfte",
  "Jill",
  "Jismond",
  "Jivete",
  "Joana",
  "Joanna",
  "Jocasta",
  "Jocea",
  "Jocey",
  "Jocosa",
  "Jodoca",
  "Johi",
  "Joia",
  "Joie",
  "Joiha",
  "Jokie",
  "Joleicia",
  "Jolenta",
  "Jolicia",
  "Jone",
  "Jordan",
  "Josebe",
  "Josephine",
  "Josiane",
  "Josina",
  "Josse",
  "Jossy",
  "Josune",
  "Jourdenete",
  "Joveta",
  "Joxepa",
  "Joya",
  "Joye",
  "Joyeuse",
  "Joyse",
  "Judda",
  "Juelina",
  "Juet",
  "Juete",
  "Juetta",
  "Jugatx",
  "Juheta",
  "Juhota",
  "Juicea",
  "Juicia",
  "Julene",
  "Julian",
  "Juliana",
  "Juliane",
  "Julie",
  "Julienne",
  "Juliet",
  "Juliote",
  "Julitta",
  "Julyan",
  "June",
  "Jurdana",
  "Jurre",
  "Justina",
  "Juwete",
  "Juye",
  "Kaithren",
  "Kalare",
  "Kallisto",
  "Kallixeina",
  "Kalotte",
  "Karin",
  "Karine",
  "Karitate",
  "Karmele",
  "Kassandra",
  "Kat",
  "Katalin",
  "Katana",
  "Kate",
  "Katelin",
  "Katelina",
  "Kateline",
  "Katerin",
  "Katerina",
  "Katerine",
  "Katering",
  "Kateryn",
  "Kateryna",
  "Kateryne",
  "Katharina",
  "Katharine",
  "Katherin",
  "Katherine",
  "Katherne",
  "Katheryn",
  "Katheryne",
  "Kathren",
  "Kathrine",
  "Katina",
  "Katixa",
  "Katja",
  "Katrina",
  "Katrine",
  "Katring",
  "Katryne",
  "Kattalin",
  "Katte",
  "Kea",
  "Keina",
  "Kemma",
  "Kephissa",
  "Kharmion",
  "Khlöe",
  "Khloris",
  "Kiena",
  "Kiles",
  "Kima",
  "Kimbery",
  "Kinborough",
  "Kinburga",
  "Kineburga",
  "Kinna",
  "Kistie",
  "Kitt",
  "Kitty",
  "Kizkitza",
  "Kizzy",
  "Kleio",
  "Kleopatra",
  "Klymene",
  "Klytemnestra",
  "Knellste",
  "Kodes",
  "Koldobike",
  "Kontxesi",
  "Kontzeziona",
  "Kordel",
  "Kordula",
  "Koré",
  "Koritto",
  "Koru",
  "Krabelin",
  "Kriemhild",
  "Kungund",
  "Kuni",
  "Kupe",
  "Kupie",
  "Kydilla",
  "Kymme",
  "Kyneburg",
  "Kynna",
  "Kynthia",
  "Kypris",
  "Kyra",
  "Kytte",
  "Labda",
  "Labinia",
  "Ladina",
  "Laetitia",
  "Lagliua",
  "Laguia",
  "Laguntzane",
  "Laida",
  "Lais",
  "Lalage",
  "Lall",
  "Lally",
  "Lamia",
  "Lamiaran",
  "Lamindao",
  "Lamke",
  "Lampetie",
  "Lampito",
  "Landa",
  "Landburuga",
  "Landerra",
  "Landgarda",
  "Landrada",
  "Langhuie",
  "Langiva",
  "Langlaua",
  "Langlif",
  "Lanike",
  "Lanthildis",
  "Lantuuara",
  "Laodameia",
  "Laodamia",
  "Laodice",
  "Laothoe",
  "Larraintzar",
  "Larraitz",
  "Larrara",
  "Larrauri",
  "Larraza",
  "Lasagain",
  "Lasarte",
  "Lasthena",
  "Latona",
  "Latsari",
  "Latxe",
  "Laua",
  "Laura",
  "Laurana",
  "Laurente",
  "Laurentia",
  "Laureola",
  "Lauretia",
  "Lauretta",
  "Lavena",
  "Lavin",
  "Lavina",
  "Lebdrudis",
  "Lece",
  "Lecelin",
  "Lecelina",
  "Lecenta",
  "Lecia",
  "Lecie",
  "Leda",
  "Leddinga",
  "Lede",
  "Lefchild",
  "Leffeda",
  "Leffquen",
  "Lefled",
  "Lefleda",
  "Lefquen",
  "Lefquena",
  "Lefquene",
  "Lefquenn",
  "Lefqwen",
  "Lefwen",
  "Lefwenna",
  "Legarda",
  "Legarra",
  "Legendika",
  "Legundia",
  "Leioar",
  "Leire",
  "Leitz",
  "Lekaretxe",
  "Lena",
  "Leocadia",
  "Leofwena",
  "Leogife",
  "Leolina",
  "Leonina",
  "Leontia",
  "Leorin",
  "Lerate",
  "Lerden",
  "Letasu",
  "Lete",
  "Letia",
  "Letice",
  "Leticia",
  "Leto",
  "Letoys",
  "Letselina",
  "Lett",
  "Lette",
  "Lettice",
  "Lettie",
  "Letty",
  "Letyce",
  "Leucothea",
  "Leucothoë",
  "Leueiua",
  "Leuekin",
  "Leuerun",
  "Leueua",
  "Leueue",
  "Leuieua",
  "Leuild",
  "Leuiua",
  "Leurona",
  "Leurun",
  "Leuruna",
  "Leuuich",
  "Leveva",
  "Lewana",
  "Lewen",
  "Lewena",
  "Lexuri",
  "Lezaeta",
  "Lezana",
  "Lezeta",
  "Lia",
  "Liana",
  "Liaueld",
  "Libourc",
  "Licia",
  "Lictina",
  "Lide",
  "Lidiardis",
  "Liecia",
  "Liedrada",
  "Liefhun",
  "Lieftet",
  "Lientje",
  "Liepmayt",
  "Lierni",
  "Lieste",
  "Lietgarda",
  "Lietgardis",
  "Lietuuif",
  "Lieuuara",
  "Liffild",
  "Lifgarda",
  "Ligarda",
  "Lige",
  "Lili",
  "Lilura",
  "Limnoreia",
  "Lina",
  "Linda",
  "Lindi",
  "Linet",
  "Linette",
  "Linnet",
  "Linniue",
  "Linota",
  "Linyeve",
  "Linyive",
  "Liobgytha",
  "Liobsynde",
  "Liodburga",
  "Liodgard",
  "Liodrada",
  "Lion",
  "Lioness",
  "Lirain",
  "Lisia",
  "Litburh",
  "Litgardis",
  "Litiardis",
  "Liuete",
  "Liueua",
  "Liuilda",
  "Liuitha",
  "Liuiua",
  "Liutgarde",
  "Livid",
  "Livith",
  "Lizarazu",
  "Lohitzune",
  "Loinaz",
  "Lois",
  "Lootje",
  "Lopene",
  "Lora",
  "Lore",
  "Lorella",
  "Lorencete",
  "Loreta",
  "Lorete",
  "Loretta",
  "Lorie",
  "Lota",
  "Louisa",
  "Louve",
  "Loverun",
  "Loza",
  "Lubias",
  "Lubje",
  "Lubke",
  "Lucardis",
  "Luce",
  "Lucete",
  "Lucette",
  "Lucey",
  "Luciana",
  "Lucie",
  "Lucina",
  "Lucque",
  "Lucy",
  "Luffechild",
  "Lugardis",
  "Luilda",
  "Luixa",
  "Lukene",
  "Lumka",
  "Lumke",
  "Luned",
  "Lunet",
  "Lunete",
  "Lur",
  "Lutisse",
  "Luuechild",
  "Lynette",
  "Lyneue",
  "Lyonnete",
  "Lype",
  "Lyra",
  "Lyse",
  "Lyveva",
  "Maarrieta",
  "Mab",
  "Mabbe",
  "Mabel",
  "Mabell",
  "Mabella",
  "Mabet",
  "Mabil",
  "Mabila",
  "Mabile",
  "Mabileite",
  "Mabilete",
  "Mabiley",
  "Mabilia",
  "Mabilie",
  "Mabill",
  "Mabilla",
  "Mabillae",
  "Mabillia",
  "Mabin",
  "Mable",
  "Mabley",
  "Mably",
  "Mabot",
  "Mabota",
  "Mabs",
  "Mabyle",
  "Macedonia",
  "Machtildis",
  "Mactilda",
  "Mactildis",
  "Madelgarde",
  "Madelrada",
  "Madge",
  "Madhalberta",
  "Maeonia",
  "Maera",
  "Maerwynn",
  "Mag",
  "Mage",
  "Magg",
  "Magge",
  "Maggie",
  "Maggot",
  "Maggote",
  "Maghenyld",
  "Maghtild",
  "Magot",
  "Magota",
  "Magote",
  "Magott",
  "Magthildis",
  "Magtildis",
  "Magy",
  "Mahald",
  "Mahalt",
  "Mahats",
  "Mahaud",
  "Mahault",
  "Mahaut",
  "Mahenyld",
  "Maheut",
  "Mahhild",
  "Mahina",
  "Mahthild",
  "Mahthildis",
  "Maia",
  "Maialen",
  "Maiandria",
  "Maider",
  "Maike",
  "Maiken",
  "Mairangi",
  "Mairenni",
  "Maisie",
  "Maitagarri",
  "Maitane",
  "Maite",
  "Maiteder",
  "Maitena",
  "Makatza",
  "Malasintha",
  "Malasuintha",
  "Maldea",
  "Malen",
  "Manel",
  "Maneld",
  "Mania",
  "Manild",
  "Manna",
  "Mantzia",
  "Map",
  "Marabel",
  "Marama",
  "Margar",
  "Margaret",
  "Margareta",
  "Margarete",
  "Margarett",
  "Margarette",
  "Margaria",
  "Margarit",
  "Margarita",
  "Margat",
  "Margeria",
  "Margerie",
  "Margerye",
  "Marget",
  "Margetta",
  "Margoret",
  "Margot",
  "Margrat",
  "Margreit",
  "Margret",
  "Margriet",
  "Margue",
  "Marguerin",
  "Marguerite",
  "Margueritte",
  "Marguerot",
  "Margyt",
  "Mari",
  "Maria",
  "Mariaka",
  "Maribella",
  "Marider",
  "Marilena",
  "Mariora",
  "Mariorie",
  "Mariory",
  "Maritxu",
  "Marjer",
  "Marjeria",
  "Marjoria",
  "Marjorie",
  "Marjory",
  "Markaret",
  "Markuuara",
  "Marlies",
  "Maronne",
  "Marozia",
  "Marpessa",
  "Marquise",
  "Marrory",
  "Marsilia",
  "Martha",
  "Martie",
  "Martine",
  "Martixa",
  "Martxelie",
  "Mary",
  "Maryell",
  "Masawa",
  "Masticana",
  "Matasuntha",
  "Mathe",
  "Matheld",
  "Mathena",
  "Mathila",
  "Mathild",
  "Mathildis",
  "Matild",
  "Matilde",
  "Matildis",
  "Matill",
  "Matilldis",
  "Matillis",
  "Mattie",
  "Matty",
  "Matxalen",
  "Maud",
  "Maude",
  "Maughtild",
  "Mauld",
  "Maura",
  "Mauriana",
  "Maut",
  "Mautild",
  "Mawd",
  "Mawde",
  "Mawt",
  "Maxencia",
  "Maximina",
  "Maynild",
  "Maysant",
  "Maysaunt",
  "Mazelina",
  "Meaka",
  "Mechtild",
  "Meckil",
  "Medea",
  "Medesicaste",
  "Meemte",
  "Meg",
  "Megaera",
  "Megara",
  "Megare",
  "Megaris",
  "Mege",
  "Megenberta",
  "Megendrod",
  "Megenhelda",
  "Megenlind",
  "Megenlioba",
  "Megensind",
  "Megensinda",
  "Megenuuara",
  "Megethia",
  "Megge",
  "Meggot",
  "Megy",
  "Mehenilda",
  "Meifte",
  "Meinburg",
  "Meinnelda",
  "Meinsent",
  "Meinswindis",
  "Meisent",
  "Meite",
  "Melania",
  "Melanie",
  "Melantho",
  "Meldred",
  "Melicent",
  "Melisant",
  "Melisenda",
  "Melisent",
  "Melisentia",
  "Melissa",
  "Melissent",
  "Melita",
  "Melite",
  "Melodia",
  "Melodie",
  "Melusine",
  "Menborch",
  "Mendi",
  "Mendia",
  "Mendiete",
  "Mendigaa",
  "Menelaia",
  "Menga",
  "Mengarde",
  "Menica",
  "Menosa",
  "Mentzia",
  "Meraud",
  "Mere",
  "Merewen",
  "Merewina",
  "Merget",
  "Mergret",
  "Merhild",
  "Meriall",
  "Meriel",
  "Merilda",
  "Merope",
  "Merwenna",
  "Meryall",
  "Meryld",
  "Methdin",
  "Methild",
  "Methildis",
  "Metis",
  "Metriche",
  "Metylda",
  "Michaela",
  "Michièle",
  "Mientje",
  "Mikele",
  "Milagros",
  "Milborough",
  "Milbrer",
  "Milburegh",
  "Milburew",
  "Milburga",
  "Milburh",
  "Milbury",
  "Milcentia",
  "Mildthryth",
  "Milesent",
  "Milessent",
  "Milia",
  "Milicent",
  "Milicenta",
  "Milisandia",
  "Milisant",
  "Milisendis",
  "Milisent",
  "Milla",
  "Mille",
  "Millesant",
  "Millesenta",
  "Milo",
  "Milto",
  "Mina",
  "Minervina",
  "Miniain",
  "Minicea",
  "Minna",
  "Minnota",
  "Mique",
  "Mira",
  "Mirabell",
  "Mirabella",
  "Mirabelle",
  "Mirabilis",
  "Mirabillla",
  "Mirable",
  "Mirari",
  "Mirella",
  "Miren",
  "Mirentxu",
  "Miriald",
  "Miriel",
  "Miriela",
  "Mirield",
  "Mirielda",
  "Mirielis",
  "Miriella",
  "Miriild",
  "Mirils",
  "Missa",
  "Mitri",
  "Mitxoleta",
  "Moder",
  "Moderte",
  "Modesty",
  "Moe",
  "Mog",
  "Mogg",
  "Mogge",
  "Mogota",
  "Mohaut",
  "Molara",
  "Mold",
  "Molde",
  "Molora",
  "Molpadia",
  "Molt",
  "Monette",
  "Monima",
  "Monime",
  "Monlora",
  "Montagne",
  "Moolde",
  "Mopp",
  "Moppe",
  "Moschia",
  "Mott",
  "Motte",
  "Moude",
  "Moulde",
  "Moysant",
  "Moysent",
  "Munia",
  "Muno",
  "Munondoa",
  "Muntsaratz",
  "Murgindueta",
  "Murie",
  "Muriel",
  "Muriele",
  "Muriella",
  "Murienne",
  "Murina",
  "Muruzabal",
  "Muskilda",
  "Muskoa",
  "Muxika",
  "Mydrede",
  "Mykale",
  "Mylecent",
  "Mylisant",
  "Mylla",
  "Mylle",
  "Myrine",
  "Nabarne",
  "Nabarra",
  "Nafarroa",
  "Nagore",
  "Nahikari",
  "Naiara",
  "Nane",
  "Nantechildis",
  "Naroa",
  "Natividad",
  "Nausicaa",
  "Nazubal",
  "Neaera",
  "Negu",
  "Nekane",
  "Nell",
  "Nellie",
  "Nelly",
  "Nemerte",
  "Nephele",
  "Nerea",
  "Nereida",
  "Nesaea",
  "Nest",
  "Nesta",
  "Ngaio",
  "Ngawai",
  "Nicasia",
  "Nichola",
  "Nicholaa",
  "Nichole",
  "Nicholina",
  "Nicia",
  "Nicol",
  "Nicola",
  "Nicolaa",
  "Nicole",
  "Nicopolis",
  "Nidlebis",
  "Niesenn",
  "Nieves",
  "Nikaia",
  "Nikasepolis",
  "Niko",
  "Nikole",
  "Niobe",
  "Niree",
  "Noblete",
  "Nog",
  "Nogga",
  "Nogge",
  "Nonna",
  "Nora",
  "Nordrada",
  "Norma",
  "Nunile",
  "Nycaise",
  "Nyra",
  "Nyree",
  "Nyrie",
  "Nysa",
  "Ockje",
  "Oda",
  "Odala",
  "Odburga",
  "Odela",
  "Odelina",
  "Odgiva",
  "Odguda",
  "Odgudana",
  "Odiern",
  "Odierna",
  "Odierne",
  "Odila",
  "Odile",
  "Odilia",
  "Odlenda",
  "Odolina",
  "Odriana",
  "Oenone",
  "Ogiva",
  "Oianko",
  "Oiartza",
  "Oibar",
  "Oihana",
  "Oihane",
  "Oilandoi",
  "Oinaze",
  "Oitane",
  "Oitia",
  "Oka",
  "Okon",
  "Olaia",
  "Olaiz",
  "Olalla",
  "Olar",
  "Olaria",
  "Olartia",
  "Olatz",
  "Olburgis",
  "Olga",
  "Olif",
  "Oliff",
  "Olimpias",
  "Olite",
  "Oliua",
  "Olive",
  "Olivet",
  "Olivia",
  "Ollano",
  "Olleta",
  "Ollett",
  "Olligtie",
  "Oloriz",
  "Olyff",
  "Olyffe",
  "Olympias",
  "Olyve",
  "Omphale",
  "Onditz",
  "Ondiz",
  "Oneka",
  "Onintza",
  "Onora",
  "Opakua",
  "Optata",
  "Orabell",
  "Orabella",
  "Orabilia",
  "Orabilis",
  "Orabla",
  "Orable",
  "Orbaiz",
  "Ordizia",
  "Oreithuia",
  "Oreithyia",
  "Orella",
  "Orenge",
  "Orengia",
  "Oreute",
  "Organa",
  "Oria",
  "Oriabel",
  "Oriande",
  "Oriante",
  "Orieldis",
  "Oriholt",
  "Oriold",
  "Oriolda",
  "Oriolt",
  "Orithyia",
  "Oriz",
  "Oro",
  "Oroitze",
  "Ororbia",
  "Orose",
  "Orrao",
  "Orreaga",
  "Orsina",
  "Orsola",
  "Orthia",
  "Orzuri",
  "Osabide",
  "Osakun",
  "Osane",
  "Osasune",
  "Osgarda",
  "Osgiua",
  "Osina",
  "Osith",
  "Ositha",
  "Oskia",
  "Osteriz",
  "Osthryd",
  "Ostrogotho",
  "Ostryd",
  "Ostrythe",
  "Osyth",
  "Otberta",
  "Otgiua",
  "Otgiva",
  "Otilia",
  "Otonia",
  "Otsana",
  "Otsanda",
  "Ottavia",
  "Ottilia",
  "Otzaurte",
  "Our Lady of Begona",
  "Ourse",
  "Oydela",
  "Pacchild",
  "Palatina",
  "Pales",
  "Pandonia",
  "Pandwyna",
  "Panope",
  "Panora",
  "Panpoxa",
  "Pantxike Patxi",
  "Pare",
  "Parezi",
  "Parise",
  "Parisete",
  "Parmys",
  "Parnel",
  "Parnell",
  "Paronel",
  "Parthenia",
  "Parthenope",
  "Parysatis",
  "Pasara",
  "Pasiphae",
  "Paskalin",
  "Pasques",
  "Passara",
  "Passerose",
  "Pateria",
  "Paternain",
  "Patricia",
  "Patty",
  "Pauee",
  "Paui",
  "Pauie",
  "Paula",
  "Pauli",
  "Paulina",
  "Paveya",
  "Paveye",
  "Paz",
  "Pechel",
  "Peg",
  "Peggy",
  "Pelela",
  "Pelopia",
  "Peneli",
  "Penelope",
  "Penne",
  "Pentecost",
  "Pentecouste",
  "Penthesilea",
  "Percalus",
  "Pereite",
  "Perialla",
  "Periboea",
  "Pericleia",
  "Pernel",
  "Pernella",
  "Pernelle",
  "Pero",
  "Peronel",
  "Peronele",
  "Peronell",
  "Peronelle",
  "Perrete",
  "Perronele",
  "Perronnele",
  "Perronnelle",
  "Perrote",
  "Perse",
  "Persephone",
  "Persis",
  "Pertesia",
  "Pertxenta",
  "Pervica",
  "Pervinca",
  "Peryna",
  "Peta",
  "Peternel",
  "Peternell",
  "Peternella",
  "Petje",
  "Petrona",
  "Petronel",
  "Petronella",
  "Petronilla",
  "Petronille",
  "Petronyl",
  "Phaedra",
  "Phaedre",
  "Phaedyme",
  "Phaethusa",
  "Phaia",
  "Pharahildis",
  "Phelipote",
  "Phelis",
  "Phemie",
  "Pherenike",
  "Pheretima",
  "Pherusa",
  "Phigaleia",
  "Philea",
  "Philinna",
  "Philip",
  "Philippe",
  "Philles",
  "Phillice",
  "Phillida",
  "Phillip",
  "Philomache",
  "Philomela",
  "Philomena",
  "Philona",
  "Philota",
  "Phoebe",
  "Phratagune",
  "Phryne",
  "Phylace",
  "Phylia",
  "Phyllis",
  "Phylo",
  "Phylomedusa",
  "Pia",
  "Piedad",
  "Pilar",
  "Pilare",
  "Pipa",
  "Pippa",
  "Pizkunde",
  "Placencia",
  "Placidia",
  "Placidina",
  "Pleasant",
  "Pleasaunce",
  "Plectrudis",
  "Plente",
  "Plesance",
  "Plesancia",
  "Plesantia",
  "Plesencia",
  "Podarge",
  "Pogge",
  "Poggy",
  "Poko",
  "Polly",
  "Polycaste",
  "Polydamna",
  "Polydora",
  "Polymede",
  "Polyxena",
  "Pompeiana",
  "Popelina",
  "Poyo",
  "Pozne",
  "Praeiecta",
  "Preciosa",
  "Precious",
  "Presentacion",
  "Primaveira",
  "Primeveire",
  "Printza",
  "Proba",
  "Probina",
  "Procne",
  "Procris",
  "Prone",
  "Pronèle",
  "Proseria",
  "Protezy",
  "Prothasey",
  "Prothesia",
  "Proto",
  "Protogonia",
  "Prudencia",
  "Prudentia",
  "Prudie",
  "Prue",
  "Psamathe",
  "Psyche",
  "Pueyo",
  "Purificacion",
  "Purissimma",
  "Purnelle",
  "Purnle",
  "Putiputi",
  "Puy",
  "Pylia",
  "Pypa",
  "Pyrrha",
  "Pythias",
  "Quenburga",
  "Quenell",
  "Queneua",
  "Quenild",
  "Quenilda",
  "Quenill",
  "Quenilla",
  "Queniua",
  "Quenyeve",
  "Quenylda",
  "Quynel",
  "Qwinhild",
  "Ra",
  "Radagundis",
  "Radborg",
  "Radburg",
  "Radburgis",
  "Radegund",
  "Radeken",
  "Radgert",
  "Radlia",
  "Radogund",
  "Radsuinda",
  "Rainilda",
  "Rainildis",
  "Raisa",
  "Ramburga",
  "Rametta",
  "Ramona",
  "Rangi",
  "Rante",
  "Rata",
  "RayneReine",
  "Rechemay",
  "Reenste",
  "Reeste",
  "Regana",
  "Regenburuga",
  "Regenelda",
  "Regenlind",
  "Regenset",
  "Reginsuint",
  "Regneuuig",
  "Regula",
  "Reimerich",
  "Reinewif",
  "Reingard",
  "Reingardis",
  "Reingart",
  "Reingaud",
  "Reingod",
  "Reinhedis",
  "Reinne",
  "Reinsuent",
  "Relindis",
  "Remedios",
  "Renata",
  "Renburgis",
  "Renilla",
  "Rennewief",
  "Rerte",
  "Resli",
  "Reta",
  "Rewa",
  "Rewi",
  "Reyna",
  "Reyne",
  "Rhea",
  "Rhene",
  "Rhoda",
  "Rhode",
  "Rhodope",
  "Riberta",
  "Richardyne",
  "Richelda",
  "Richemeya",
  "Richenda",
  "Richenza",
  "Richessa",
  "Richil",
  "Richild",
  "Richildis",
  "Richill",
  "Richmal",
  "Richoard",
  "Richolda",
  "Riclindis",
  "Ricolda",
  "Ricsuinda",
  "Rieke",
  "Rikild",
  "Rikilda",
  "Rikilde",
  "Rikildis",
  "Rikmai",
  "Rinelt",
  "Rinilda",
  "Rinne",
  "Rinnett",
  "Rixenda",
  "Rixende",
  "Roana",
  "Roberge",
  "Rochilda",
  "Rodburga",
  "Rodelinda",
  "Rodgarda",
  "Rodgardae",
  "Roes",
  "Roese",
  "Roesia",
  "Roesli",
  "Rofsind",
  "Rogerete",
  "Roheis",
  "Roheisa",
  "Roheisia",
  "Rohese",
  "Rohesia",
  "Rohez",
  "Roimata",
  "Roisia",
  "Rokilda",
  "Roos",
  "Rosa",
  "Rosalind",
  "Rosalinda",
  "Rosaline",
  "Rosamond",
  "Rosamund",
  "Rosamunda",
  "Rosario",
  "Rose",
  "Roseaman",
  "Roseia",
  "Rosemond",
  "Rosemonde",
  "Rosemunda",
  "Roslindis",
  "Rosomon",
  "Rossamond",
  "Roste",
  "Roswitha",
  "Rotburga",
  "Rothaide",
  "Rothais",
  "Rothin",
  "Rotlenda",
  "Rotrude",
  "Rotrudis",
  "Rousse",
  "Roxane",
  "Royce",
  "Roysa",
  "Royse",
  "Roysia",
  "Rozeman",
  "Rubea",
  "Ruothilde",
  "Rupe",
  "Rustica",
  "Rusticana",
  "Rychyld",
  "Rykeld",
  "Sabbe",
  "Sabie",
  "Sabin",
  "Sabine",
  "Saby",
  "Sabyn",
  "Saethrith",
  "Saethryda",
  "Sagarduia",
  "Sagari",
  "Sageua",
  "Sageue",
  "Sahats",
  "Saieua",
  "Saintisme",
  "Saints",
  "Saioa",
  "Saiua",
  "Salerna",
  "Sallurtegi",
  "Saloua",
  "Salove",
  "Salvianella",
  "Samke",
  "Sanceline",
  "Sancha",
  "Sanche",
  "Sanctia",
  "Santutxo",
  "Sappho",
  "Sarke",
  "Sayeua",
  "Sayeva",
  "Sayntes",
  "Sayua",
  "Scholace",
  "Scholast",
  "Science",
  "Sciencia",
  "Scientia",
  "Scolacia",
  "Scolastica",
  "Scylla",
  "Sebasteia",
  "Seburg",
  "Seburga",
  "Seburuh",
  "Secile",
  "Sedaina",
  "Sedania",
  "Sedehanna",
  "Sedemai",
  "Sedemaiden",
  "Sedemode",
  "Sedille",
  "Sédillon",
  "Sedilon",
  "Seghuie",
  "Seheve",
  "Seiua",
  "Sela",
  "Selinah",
  "Seloua",
  "Seloue",
  "Selova",
  "Seluue",
  "Sely",
  "Semele",
  "Semera",
  "Sence",
  "Sens",
  "Senses",
  "Serena",
  "Sergia",
  "Seuar",
  "Seuare",
  "Sewenna",
  "Seyiua",
  "Seyua",
  "Sib",
  "Sibb",
  "Sibba",
  "Sibbe",
  "Sibbet",
  "Sibbly",
  "Sibbot",
  "Sibel",
  "Sibeli",
  "Sibell",
  "Sibella",
  "Sibely",
  "Sibil",
  "Sibile",
  "Sibilia",
  "Sibilie",
  "Sibilla",
  "Sibley",
  "Sibli",
  "Sibly",
  "Siborch",
  "Sibota",
  "Sibri",
  "Sibry",
  "Siburg",
  "Sibyll",
  "Sibylla",
  "Sicillia",
  "Siddon",
  "Sidney",
  "Sidonia",
  "Sidonie",
  "Sieber",
  "Sierida",
  "Sieverte",
  "Sigarda",
  "Sigberta",
  "Sigeberta",
  "Sigeburgis",
  "Sigerith",
  "Sigethrod",
  "Sigiburgis",
  "Silke",
  "Sillina",
  "Silva",
  "Similce",
  "Sina",
  "Sindonia",
  "Sira",
  "Sirida",
  "Siscella",
  "Sisilla",
  "Sisley",
  "Sisse",
  "Sissota",
  "Sisygambis",
  "Sjante",
  "Snelburch",
  "Soberich",
  "Sofie",
  "Soiartze",
  "Sokorri",
  "Sol",
  "Soledad",
  "Sonja",
  "Sophia",
  "Sophoniba",
  "Sophonisba",
  "Sophonsiba",
  "Sorauren",
  "Sorkunde",
  "Sorne",
  "Soskao",
  "Sotera",
  "Soterraa",
  "Souplice",
  "Speio",
  "Splendora",
  "Sreda",
  "Stacia",
  "Stamburc",
  "Stanborw",
  "Stanburch",
  "Stangiva",
  "Stanguie",
  "Stanhilda",
  "Stanild",
  "Stanilde",
  "Stanuie",
  "Stanyue",
  "Stateira",
  "Stenburch",
  "Stephanie",
  "Stheneboea",
  "Stientje",
  "Stilleuuara",
  "Stina",
  "Stonild",
  "Stonilda",
  "Stonildi",
  "Stratonice",
  "Strilleburg",
  "Sueta",
  "Sueteluue",
  "Suitburgis",
  "Sungyve",
  "Sunigilda",
  "Sunilda",
  "Sunna",
  "Sunngifu",
  "Susanna",
  "Swale",
  "Swantje",
  "Sweteloue",
  "Swetelove",
  "Swethyna",
  "Swetiue",
  "Swetyene",
  "Swetyne",
  "Syagria",
  "Syardis",
  "Sybbly",
  "Sybby",
  "Sybell",
  "Sybil",
  "Sybill",
  "Sybilla",
  "Sybille",
  "Sybyle",
  "Sybyll",
  "Sybyly",
  "Sycily",
  "Syele",
  "Synnove",
  "Sysley",
  "Syslye",
  "Tacey",
  "Tacia",
  "Tacye",
  "Taggett",
  "Taggy",
  "Taiaroa",
  "Talaitha",
  "Tamati",
  "Tatje",
  "Tawhaki",
  "Tece",
  "Tecmessa",
  "Tede",
  "Telephassa",
  "Teresa",
  "Terese",
  "Tetradia",
  "Tetxa",
  "Teudsindis",
  "Thais",
  "Thalassa",
  "Thaleia",
  "Thalke",
  "Thancuuara",
  "Thangustella",
  "Thea",
  "Theaduuara",
  "Theano",
  "Thebe",
  "Thedela",
  "Theeste",
  "Theldred",
  "Theldry",
  "Thelma",
  "Themis",
  "Theocharista",
  "Theodananda",
  "Theodelinda",
  "Theoderada",
  "Theodora",
  "Theodoracis",
  "Theodosia",
  "Theodotis",
  "Theognosia",
  "Theophane",
  "Theophania",
  "Theophano",
  "Theresa",
  "Thessala",
  "Thessalonike",
  "Thetis",
  "Theutberga",
  "Thidela",
  "Thieda",
  "Thietgarda",
  "Thietuuich",
  "Thietwara",
  "Thiodsind",
  "Thiodsuinda",
  "Thisbe",
  "Thiudigotho",
  "Thiutuuara",
  "Thoë",
  "Thomassa",
  "Thomassia",
  "Thoösa",
  "Thrasborg",
  "Thrudberga",
  "Thyia",
  "Tice",
  "Ticekin",
  "Tiece",
  "Tièce",
  "Tiecelin",
  "Tiecia",
  "Tiede",
  "Tietlenda",
  "Tietza",
  "Tilda",
  "Till",
  "Tilla",
  "Tille",
  "Tillie",
  "Tillot",
  "Tillota",
  "Tillote",
  "Tilly",
  "Timandra",
  "Timo",
  "Tina",
  "Tiwho",
  "Tjabbend",
  "Tjalde",
  "Toda",
  "Toi",
  "Toloo",
  "Tomyris",
  "Tonna",
  "Toto",
  "Trhutborgana",
  "Trinidad",
  "Trissie",
  "Trixie",
  "Truda",
  "Trudi",
  "Trudlinde",
  "True",
  "Truffeni",
  "Trutilda",
  "Tryphena",
  "Tryphosa",
  "Tui",
  "Tungia",
  "Turi",
  "Txori",
  "Tyèce",
  "Tyecelin",
  "Tyeceline",
  "Tyro",
  "Ualdburg",
  "Ualdethruda",
  "Uba",
  "Ubaga",
  "Ubarriaran",
  "Uda",
  "Udaberri",
  "Udala",
  "Udane",
  "Udara",
  "Udazken",
  "Udelina",
  "Udeline",
  "Udiarraga",
  "Udoz",
  "Ueremund",
  "Uerenburoc",
  "Uga",
  "Ugarte",
  "Uiburgis",
  "Uindborog",
  "Uinebarga",
  "Uireda",
  "Ula",
  "Ulfhild",
  "Ulgarda",
  "Uli",
  "Ulia",
  "Ulveva",
  "Unice",
  "Untza",
  "Untzizu",
  "Uoldolberta",
  "Uraburu",
  "Uralde",
  "Urbe",
  "Urcy",
  "Urdaiaga",
  "Urdie",
  "Urdina",
  "Uriarte",
  "Uribarri",
  "Urie",
  "Uriz",
  "Urkia",
  "Uronea",
  "Urraka",
  "Urrategi",
  "Urrea",
  "Urreturre",
  "Urretxa",
  "Urrexola",
  "Urrialdo",
  "Urroz",
  "Ursaly",
  "Ursel",
  "Urseley",
  "Ursell",
  "Ursola",
  "Urtune",
  "Urtza",
  "Urtzumu",
  "Uschi",
  "Usmene",
  "Usoa",
  "Usue",
  "Usune",
  "Utsune",
  "Uzuri",
  "Vadamerca",
  "Valdamerca",
  "Vanora",
  "Veleda",
  "Veneranda",
  "Verena",
  "Vesta",
  "Vigilantia",
  "Vigilia",
  "Violante",
  "Violet",
  "Violetta",
  "Violette",
  "Visitacion",
  "Vitula",
  "Vivian",
  "Viviana",
  "Vivien",
  "Vivienne",
  "Vreneli",
  "Vreni",
  "Vrowecin",
  "Vualdberta",
  "Vualdedruda",
  "Vualdetruda",
  "Vuifken",
  "Vuinetberta",
  "Vuissance",
  "Vuiuechin",
  "Wackrill",
  "Waerburg",
  "Waitohi",
  "Waldburg",
  "Waldrada",
  "Wander",
  "Wannore",
  "Wannour",
  "Wantelien",
  "Wantliana",
  "Warehild",
  "Watcelina",
  "Wavin",
  "Wea",
  "Wealdburg",
  "Wealhburg",
  "Weertje",
  "Wekerild",
  "Wemke",
  "Wendel",
  "Wenefreda",
  "Wenthelen",
  "Wentiliana",
  "Werburg",
  "Werburga",
  "Werburgh",
  "Werbyrgh",
  "Wereburga",
  "Whetu",
  "Wibke",
  "Wiblind",
  "Wiburge",
  "Wiburgis",
  "Wiemda",
  "Wifhildis",
  "Wihted",
  "Wilberga",
  "Wilgefortis",
  "Wilgeva",
  "Willelda",
  "Willelma",
  "Willesuindis",
  "Wilmetta",
  "Wilmke",
  "Wilmot",
  "Wimarc",
  "Wimarca",
  "Winefred",
  "Winifred",
  "Winnifred",
  "Wivecin",
  "Wivin",
  "Wlbergis",
  "Wlbgis",
  "Wlfeuua",
  "Wlfildis",
  "Wlgert",
  "Wlueth",
  "Wluiaa",
  "Wluiua",
  "Wluyua",
  "Wlveva",
  "Wocbke",
  "Wofled",
  "Wolfleda",
  "Wolueua",
  "Wolueue",
  "Woluiua",
  "Wubcke",
  "Wulfhilda",
  "Wulfhildis",
  "Wulfiue",
  "Wulfled",
  "Wulfleda",
  "Wulfrueua",
  "Wuluefa",
  "Wuluethia",
  "Wulueua",
  "Wuluiua",
  "Wuluiue",
  "Wulvela",
  "Wulvella",
  "Wulveva",
  "Wulveve",
  "Wulviva",
  "Wulwiua",
  "Wumke",
  "Wyberg",
  "Wybir",
  "Wybur",
  "Wyburgh",
  "Wynifreed",
  "Yayone",
  "Yda",
  "Ydany",
  "Ydeneye",
  "Ydenia",
  "Ydon",
  "Ydonea",
  "Yera",
  "Yfame",
  "Ylaire",
  "Ylaria",
  "Yllaria",
  "Ymanie",
  "Ymanya",
  "Ymanye",
  "Ymeisna",
  "Ymenia",
  "Ynstauncia",
  "Yolande",
  "Yolant",
  "Yootha",
  "Yordana",
  "Younice",
  "Yrmengardis",
  "Ysane",
  "Ysemay",
  "Ysenda",
  "Yseult",
  "Yseulte",
  "Ysmay",
  "Ysmeina",
  "Ysmena",
  "Ysmene",
  "Ysolt",
  "Ysopa",
  "Ysoria",
  "Ysoude",
  "Ysout",
  "Yulene",
  "Yvette",
  "Yzebel",
  "Xabadin",
  "Xanthe",
  "Xanthippe",
  "Xantippe",
  "Xaxi",
  "Xemein",
  "Xene",
  "Xenophile",
  "Ximena",
  "Xixili",
  "Xoramen",
  "Zabal",
  "Zabaleta",
  "Zaballa",
  "Zaloa",
  "Zamartze",
  "Zandua",
  "Zarala",
  "Zeberiogana",
  "Zelai",
  "Zelina",
  "Zelizi",
  "Zenobia",
  "Zerran",
  "Zikuaga",
  "Zilia",
  "Ziortza",
  "Zita",
  "Zoe",
  "Zohartze",
  "Zorione",
  "Zuberoa",
  "Zubia",
  "Zufiaurre",
  "Zuhaitz",
  "Zumadoia",
  "Zumalburu",
  "Zuri",
  "Zuria",
  "Zuriaa",
  "Zurie",
  "Zuza",
  "Zuzene",
  "Zwaante"
];
var MALE_NAMES = [
  "Aalart",
  "Aalef",
  "Aalot",
  "Abantes",
  "Abarrotz",
  "Abas",
  "Abascantus",
  "Abbo",
  "Abdalonymus",
  "Abderos",
  "Abelard",
  "Aberardus",
  "Aberkios",
  "Aberri",
  "Abimilki",
  "Abisme",
  "Ablabius",
  "Ablerus",
  "Abramius",
  "Abreas",
  "Abronychus",
  "Absolon",
  "Abundanitus",
  "Abydos",
  "Acaeus",
  "Acamus",
  "Acelin",
  "Acessamenus",
  "Acestes",
  "Achard",
  "Achart",
  "Achestan",
  "Achila",
  "Achololim",
  "Acindynus",
  "Aclepiades",
  "Acot",
  "Acrisias",
  "Acrisius",
  "Acroneos",
  "Actor",
  "Acun",
  "Acur",
  "Adalbero",
  "Adalbert",
  "Adalbrecht",
  "Adaldag",
  "Adalfuns",
  "Adalhard",
  "Adaloald",
  "Adame",
  "Adei",
  "Adeimanthos",
  "Adelard",
  "Adelardus",
  "Adelchis",
  "Adelphius",
  "Adelredus",
  "Adelroth",
  "Adelstan",
  "Adeluin",
  "Adelulf",
  "Adenot",
  "Aderlard",
  "Adestan",
  "Adhémar",
  "Adlard",
  "Admago",
  "Admetos",
  "Adon",
  "Adranus",
  "Adrastos",
  "Adrastus",
  "Adred",
  "Adrestus",
  "Adri",
  "Adrianus",
  "Adrien",
  "Adso",
  "Adstan",
  "Adur",
  "Aeaces",
  "Aeduin",
  "Aeduuard",
  "Aeduuin",
  "Aega",
  "Aegaeon",
  "Aegelmaer",
  "Aegicoros",
  "Aegidius",
  "Aegisthes",
  "Aegon",
  "Aeilmar",
  "Aeimnestos",
  "Aeldredus",
  "Aeldret",
  "Aelfraed",
  "Aelgar",
  "Aelger",
  "Aelmar",
  "Aelmer",
  "Aeluin",
  "Aeluuin",
  "Aenesidemos",
  "Aeolus",
  "Aeropus",
  "Aeschreas",
  "Aesculapius",
  "Aesepus",
  "Aeson",
  "Aesop",
  "Aetes",
  "Aethelmaer",
  "Aethelraed",
  "Aethon",
  "Aetion",
  "Aetios",
  "Aetolos",
  "Agamedes",
  "Agamemnon",
  "Aganbold",
  "Agapenor",
  "Agapetus",
  "Agapias",
  "Agastrophos",
  "Agathocles",
  "Agathon",
  "Agbal",
  "Ageio",
  "Agelaus",
  "Agenor",
  "Ager",
  "Agesilaus",
  "Agetos",
  "Agid",
  "Agila",
  "Agilbert",
  "Agilof",
  "Agilulf",
  "Agin",
  "Agino",
  "Agis",
  "Agiwulf",
  "Agnellus",
  "Agnien",
  "Agobard",
  "Agosti",
  "Agoztar",
  "Agrias",
  "Agriwulf",
  "Agu",
  "Ahthari",
  "Ahu",
  "Aiantes",
  "Aias",
  "Aide",
  "Aidoingus",
  "Aiert",
  "Aigeus",
  "Aignen",
  "Aigo",
  "Aigulf",
  "Ailbert",
  "Ailbric",
  "Ailbriht",
  "Ailmar",
  "Ailmer",
  "Ailred",
  "Ailuin",
  "Ailwin",
  "Ailwinus",
  "Aimar",
  "Aime",
  "Aimeri",
  "Aimeric",
  "Aimeriguet",
  "Aimery",
  "Aingeru",
  "Aintza",
  "Aioro",
  "Aire",
  "Airopos",
  "Aischylos",
  "Aistan",
  "Aistulf",
  "Aita",
  "Aithanarid",
  "Aitor",
  "Aitzol",
  "Akadios",
  "Akamas",
  "Aketza",
  "Aktis",
  "Aktor",
  "Akuhata",
  "Alahis",
  "Alain",
  "Alainon",
  "Alaire",
  "Alana",
  "Alane",
  "Alanus",
  "Alaon",
  "Alar",
  "Alarabi",
  "Alard",
  "Alarge",
  "Alaric",
  "Alaricus",
  "Alart",
  "Alastor",
  "Alatheus",
  "Alatz",
  "Alaviv",
  "Alazaïs",
  "Alberi",
  "Alberic",
  "Albericus",
  "Albertus",
  "Albgast",
  "Albi",
  "Albin",
  "Albinus",
  "Albirich",
  "Alboin",
  "Albrict",
  "Alcaeos",
  "Alcandros",
  "Alcher",
  "Alcides",
  "Alcimos",
  "Alcinous",
  "Alcmaion",
  "Alcman",
  "Alcock",
  "Alcon",
  "Aldebrand",
  "Aldemund",
  "Alderan",
  "Aldin",
  "Aldis",
  "Aldo",
  "Aldredus",
  "Aldret",
  "Alduin",
  "Aldun",
  "Aldus",
  "Aldyn",
  "Aleaume",
  "Aleaumin",
  "Alec",
  "Aleck",
  "Alector",
  "Alein",
  "Alektryon",
  "Alerot",
  "Alesander",
  "Alesaunder",
  "Alestan",
  "Aleuas",
  "Alewyn",
  "Alex",
  "Alexandir",
  "Alexandros",
  "Alexarchos",
  "Alexias",
  "Alexis",
  "Alexon",
  "Aleyn",
  "Aleyne",
  "Alfan",
  "Alfonce",
  "Alfredus",
  "Algar",
  "Alger",
  "Algor",
  "Aliaume",
  "Alica",
  "Alick",
  "Aligern",
  "Alimahus",
  "Alisander",
  "Alisandre",
  "Alisaunder",
  "Alistair",
  "Alixandre",
  "Alizaunder",
  "Alkamenos",
  "Alkestis",
  "Alketas",
  "Alkibiades",
  "Alkides",
  "Alkimachos",
  "Alkiphron",
  "Alkmaion",
  "Alla",
  "Allan",
  "Allande",
  "Allen",
  "Alleyn",
  "Allowin",
  "Almanzor",
  "Almer",
  "Almeric",
  "Almericus",
  "Alo",
  "Alodet",
  "Aloeus",
  "Alois",
  "Alots",
  "Aloysius",
  "Alphaeus",
  "Alpheos",
  "Alphesiboeus",
  "Alphios",
  "Alphonsins",
  "Alret",
  "Alsandre",
  "Altes",
  "Altzibar",
  "Aluer",
  "Aluerad",
  "Aluerd",
  "Alueredus",
  "Alured",
  "Aluredus",
  "Aluret",
  "Aluuin",
  "Aluuine",
  "Alvar",
  "Alvere",
  "Alvery",
  "Alvredus",
  "Alwinus",
  "Alwyn",
  "Alwyne",
  "Alyattes",
  "Alyaume",
  "Alypius",
  "Alysandir",
  "Amadeus",
  "Amal",
  "Amalaric",
  "Amalric",
  "Amalrich",
  "Amalricus",
  "Amalvis",
  "Amand",
  "Amanieu",
  "Amarinceus",
  "Amator",
  "Amatus",
  "Amaud",
  "Amauri",
  "Amaurri",
  "Amaury",
  "Ambe",
  "Ambrico",
  "Ambricus",
  "Ambroise",
  "Ambrosius",
  "Ambroys",
  "Ambure",
  "Ame",
  "Ameinias",
  "Ameinokles",
  "Amélien",
  "Amer",
  "Americ",
  "Americus",
  "Amery",
  "Ames",
  "Ametz",
  "Amfrid",
  "Amfridus",
  "Amiantos",
  "Amias",
  "Amiel",
  "Amigart",
  "Amils",
  "Amiot",
  "Amirrutzes",
  "Amis",
  "Amisius",
  "Ammius",
  "Ammonianus",
  "Amo",
  "Amohia",
  "Amompharetos",
  "Amopaon",
  "Ampelius",
  "Amphiaraos",
  "Amphidamos",
  "Amphimachos",
  "Amphimnestus",
  "Amphinomous",
  "Amphion",
  "Amphios",
  "Amphitrion",
  "Ampho",
  "Amuruza",
  "Amyas",
  "Amyntas",
  "Amyntor",
  "Amyon",
  "Amyris",
  "Amythaon",
  "Anabesineos",
  "Anacharsis",
  "Anafrid",
  "Anagastes",
  "Anaia",
  "Anakletos",
  "Anakoz",
  "Anakreon",
  "Anartz",
  "Anastasios",
  "Anastasius",
  "Anatolicus",
  "Anatolius",
  "Anaut",
  "Anaxagoras",
  "Anaxandridas",
  "Anaxandrides",
  "Anaxandros",
  "Anaxarchos",
  "Anaxilaus",
  "Anaximander",
  "Anaximenes",
  "Anaxis",
  "Anaxos",
  "Ancelin",
  "Ancelm",
  "Ancelmus",
  "Ancelot",
  "Anchialus",
  "Anchier",
  "Anchimolios",
  "Anchises",
  "Anchitel",
  "Ancus",
  "Andagis",
  "Ander",
  "Andhari",
  "Andima",
  "Andoitz",
  "Andokides",
  "Andolin",
  "Andoni",
  "Andraemon",
  "Andrash",
  "Andrea",
  "Andreas",
  "Andreu",
  "Andrew",
  "Andries",
  "Androbulos",
  "Androcles",
  "Androdamos",
  "Androgeus",
  "Andronicus",
  "Aner",
  "Aneristos",
  "Anfroi",
  "Anfroy",
  "Angegisis",
  "Angilbart",
  "Angilbert",
  "Anianus",
  "Anicius",
  "Aniketos",
  "Anisodoros",
  "Anixi",
  "Anketel",
  "Anketil",
  "Anketin",
  "Anko",
  "Anno",
  "Anquetil",
  "Anquetin",
  "Anschetillus",
  "Anschitillus",
  "Anscoul",
  "Ansegisel",
  "Ansehelm",
  "Anseis",
  "Anselet",
  "Ansell",
  "Ansellus",
  "Anselm",
  "Anselme",
  "Anselmet",
  "Anselmus",
  "Ansfroi",
  "Ansgor",
  "Ansgot",
  "Anshelmus",
  "Ansiau",
  "Ansila",
  "Ansis",
  "Anskar",
  "Ansketil",
  "Anskettell",
  "Ansobert",
  "Ansout",
  "Ansprand",
  "Anstill",
  "Ansure",
  "Antaeus",
  "Antagoras",
  "Antemion",
  "Antenor",
  "Anter",
  "Anthelme",
  "Anthemion",
  "Anthemius",
  "Anthimus",
  "Anthon",
  "Anthonius",
  "Antichares",
  "Antidoros",
  "Antigenes",
  "Antigonos",
  "Antikles",
  "Antilochus",
  "Antinous",
  "Antiochus",
  "Antipatris",
  "Antipatros",
  "Antiphales",
  "Antiphones",
  "Antiphus",
  "Antisthenes",
  "Antoinne",
  "Anton",
  "Antoni",
  "Antonius",
  "Antonius Tone",
  "Antony",
  "Antoynel",
  "Antso",
  "Antton",
  "Antxoka",
  "Antyaume",
  "Anysus",
  "Anytos",
  "Anytus",
  "Aoric",
  "Apahida",
  "Apal",
  "Apat",
  "Apelles",
  "Apellicon",
  "Aphidnos",
  "Api",
  "Apisaon",
  "Apollodoros",
  "Apollophanes",
  "Apollos",
  "Arabante",
  "Arabo",
  "Araimfres",
  "Aralar",
  "Arano",
  "Aranold",
  "Arapeta",
  "Aratus",
  "Aratz",
  "Arbert",
  "Arbitio",
  "Arbogast",
  "Arbogastes",
  "Arcadius",
  "Arcas",
  "Arcavius",
  "Arcebaldus",
  "Arcenbaldus",
  "Arcesilaus",
  "Archagoras",
  "Archambaud",
  "Archel",
  "Archelaos",
  "Archembald",
  "Archeptolemus",
  "Archesilaus",
  "Archestratidas",
  "Archetel",
  "Archil",
  "Archilochus",
  "Archimbalt",
  "Archytas",
  "Arcidamus",
  "Arcturus",
  "Arculf",
  "Ardabur",
  "Ardaric",
  "Ardoin",
  "Areilycus",
  "Areisius",
  "Areithous",
  "Arenvald",
  "Aresti",
  "Argades",
  "Argaeus",
  "Argaith",
  "Argi",
  "Argider",
  "Argina",
  "Argoitz",
  "Argos",
  "Ariald",
  "Ariaric",
  "Aribert",
  "Arichis",
  "Aridolis",
  "Arimir",
  "Arioald",
  "Arion",
  "Aripert",
  "Ariphron",
  "Aristaeus",
  "Aristagoras",
  "Aristaios",
  "Aristandros",
  "Aristarchos",
  "Aristarchus",
  "Aristides",
  "Aristion",
  "Aristippus",
  "Aristoboulos",
  "Aristobulus",
  "Aristocles",
  "Aristocypros",
  "Aristodemos",
  "Aristogeiton",
  "Aristomachos",
  "Ariston",
  "Aristonous",
  "Aristonymos",
  "Aristophanes",
  "Aristophantes",
  "Aristos",
  "Aristotles",
  "Aristoxenus",
  "Arius",
  "Arixo",
  "Armand",
  "Armando",
  "Armant",
  "Armatus",
  "Armenius",
  "Armentarius",
  "Armin",
  "Armine",
  "Arminel",
  "Armundus",
  "Arnaitz",
  "Arnald",
  "Arnaldus",
  "Arnalt",
  "Arnas",
  "Arnaud",
  "Arnaut",
  "Arnegis",
  "Arnegliscus",
  "Arnet",
  "Arnoald",
  "Arnold",
  "Arnoldus",
  "Arnott",
  "Arnoul",
  "Arnould",
  "Arnulf",
  "Arnwald",
  "Arold",
  "Arotza",
  "Arrabaios",
  "Arrats",
  "Arridaios",
  "Arrosko",
  "Arsaphius",
  "Arsenios",
  "Arsenius",
  "Arsieu",
  "Artaud",
  "Artavasdas",
  "Artemas",
  "Artemidoros",
  "Artemios",
  "Artemisthenes",
  "Arter",
  "Arther",
  "Artheur",
  "Arthurius",
  "Arthurus",
  "Artizar",
  "Artor",
  "Artos",
  "Artur",
  "Arturus",
  "Artus",
  "Artzai",
  "Artzeiz",
  "Arvandus",
  "Arvide",
  "Arybbas",
  "Asasthenes",
  "Asbad",
  "Asbadus",
  "Ascalaphus",
  "Ascalo",
  "Ascanius",
  "Ascelin",
  "Ascelyn",
  "Aschetel",
  "Aschetil",
  "Aschetin",
  "Aschines",
  "Ascila",
  "Asdrubal",
  "Asentzio",
  "Asier",
  "Asius",
  "Askell",
  "Asketel",
  "Asketin",
  "Asklepios",
  "Asonides",
  "Asopodoros",
  "Asopus",
  "Aspar",
  "Asphalion",
  "Aspuanis",
  "Assaraeus",
  "Asselin",
  "Astacos",
  "Astegal",
  "Astell",
  "Aster",
  "Asteri",
  "Asterion",
  "Asterius",
  "Asteropaeus",
  "Astigar",
  "Astin",
  "Astor",
  "Astorge",
  "Astrabacus",
  "Astyanax",
  "Atacinus",
  "Atarrabi",
  "Atarratze",
  "Ataulf",
  "Ataulph",
  "Athalaric",
  "Athalwolf",
  "Athamas",
  "Athanagild",
  "Athanaric",
  "Atharid",
  "Athaulf",
  "Athelard",
  "Athelardus",
  "Athelstan",
  "Athelston",
  "Athenades",
  "Athenaeus",
  "Athenion",
  "Athenodorus",
  "Atiphates",
  "Atreus",
  "Atrometos",
  "Atseden",
  "Attaginas",
  "Attaginos",
  "Attalos",
  "Atymnius",
  "Atys",
  "Atze",
  "Atzo",
  "Aubelet",
  "Auberi",
  "Aubert",
  "Aubertin",
  "Aubery",
  "Aubin",
  "Aubinnet",
  "Aubour",
  "Aubray",
  "Aubri",
  "Aubry",
  "Audax",
  "Audegar",
  "Audemar",
  "Audila",
  "Audo",
  "Audoen",
  "Audoenus",
  "Audoin",
  "Audomar",
  "Audoneus",
  "Audouin",
  "Audramnus",
  "Audri",
  "Augebert",
  "Augias",
  "Auguinare",
  "Augustinus",
  "Auletes",
  "Aunger",
  "Aunsellus",
  "Aurel",
  "Aurken",
  "Aurre",
  "Aurri",
  "Ausout",
  "Austin",
  "Austinus",
  "Austyn",
  "Autesion",
  "Autgar",
  "Authari",
  "Autodikos",
  "Autolycus",
  "Autolykos",
  "Automedon",
  "Autonous",
  "Auveray",
  "Auvere",
  "Auveré",
  "Auvrai",
  "Auxitius",
  "Auxkin",
  "Avenel",
  "Averardus",
  "Averay",
  "Avere",
  "Averet",
  "Averey",
  "Averitt",
  "Avery",
  "Avienus",
  "Avila",
  "Axular",
  "Axylus",
  "Aylard",
  "Aylbricht",
  "Aylewynus",
  "Aylmer",
  "Aylmerus",
  "Aymar",
  "Aymer",
  "Aymeri",
  "Aymie",
  "Aymon",
  "Ayol",
  "Azeari",
  "Azelinus",
  "Azémar",
  "Azer",
  "Azeus",
  "Azibar",
  "Aznar",
  "Azorius",
  "Aztore",
  "Azubeli",
  "Azur",
  "Azzo",
  "Baalhaan",
  "Babai",
  "Babylas",
  "Bacauda",
  "Bacchides",
  "Bacchios",
  "Bacchylides",
  "Bacenor",
  "Bacis",
  "Baderon",
  "Badouim",
  "Badua",
  "Baduaruis",
  "Baduila",
  "Baerius",
  "Baiardo",
  "Baiarte",
  "Baiona",
  "Bakar",
  "Baladi",
  "Balan",
  "Balasi",
  "Baldavin",
  "Baldemarus",
  "Baldewin",
  "Baldewyn",
  "Baldewyne",
  "Baldric",
  "Balduin",
  "Baldwyn",
  "Balendin",
  "Baleren",
  "Balesio",
  "Balian",
  "Baligant",
  "Balius",
  "Bangin",
  "Baptiste",
  "Barat",
  "Barates",
  "Baraxil",
  "Bardas",
  "Bardin",
  "Bardo",
  "Bardol",
  "Bardolf",
  "Bardolphus",
  "Bardulphus",
  "Barea",
  "Baret",
  "Barnard",
  "Barnet",
  "Barnier",
  "Baro",
  "Barret",
  "Barrett",
  "Barthélemy",
  "Bartholomeus",
  "Bartram",
  "Bartrem",
  "Basajaun",
  "Basan",
  "Basbrun",
  "Basequin",
  "Basile",
  "Basileides",
  "Basileios",
  "Basiliakos",
  "Basilides",
  "Basilius",
  "Basill",
  "Baso",
  "Basuin",
  "Basyle",
  "Bathyaes",
  "Batsuen",
  "Batzas",
  "Baudet",
  "Baudkin",
  "Baudoin",
  "Baudouin",
  "Baudoyn",
  "Baudry",
  "Baugulf",
  "Bausan",
  "Baut",
  "Bauto",
  "Bavo",
  "Bawden",
  "Bayard",
  "Baynard",
  "Baza",
  "Bazil",
  "Bazkoare",
  "Bazzo",
  "Beat",
  "Beatus",
  "Beaudonnier",
  "Beaudouin",
  "Begon",
  "Begue",
  "Behe",
  "Beila",
  "Bela",
  "Belasko",
  "Belin",
  "Belos",
  "Beltxe",
  "Beltza",
  "Benat",
  "Bendis",
  "Bendy",
  "Benedick",
  "Benedictus",
  "Benedicus",
  "Beneger",
  "Beneoit",
  "Benéoit",
  "Beneoite",
  "Benet",
  "Benett",
  "Beneyt",
  "Bénezet",
  "Benger",
  "Benild",
  "Benkamin",
  "Bennet",
  "Benoet",
  "Benoiet",
  "Benoist",
  "Benoit",
  "Beppolenus",
  "Berahthraben",
  "Berart",
  "Berasko",
  "Berbiz",
  "Berchar",
  "Berdaitz",
  "Berdoi",
  "Beremundo",
  "Berend",
  "Berengar",
  "Berengarius",
  "Berengerius",
  "Berengerus",
  "Berengier",
  "Berhdoldus",
  "Berhtolf",
  "Béri",
  "Berico",
  "Berig",
  "Berimud",
  "Berimund",
  "Berin",
  "Beringaer",
  "Beringer",
  "Berinhard",
  "Bernar",
  "Bernard",
  "Bernardus",
  "Bernart",
  "Bernat",
  "Bernier",
  "Berno",
  "Bero",
  "Beroald",
  "Beroldus",
  "Berolt",
  "Berriotxoa",
  "Bert",
  "Bertaut",
  "Bertelis",
  "Berteram",
  "Berthaire",
  "Berthar",
  "Berthomieu",
  "Bertie",
  "Bertilo",
  "Bertin",
  "Bertol",
  "Bertramus",
  "Bertran",
  "Bertrand",
  "Bertrannus",
  "Bertrant",
  "Bertulf",
  "Berwelfus",
  "Besgun",
  "Bessa",
  "Bessas",
  "Bessi",
  "Besso",
  "Betadur",
  "Betan",
  "Beti",
  "Betin",
  "Betyn",
  "Beuca",
  "Beucad",
  "Beuve",
  "Beuves",
  "Beves",
  "Bevon",
  "Bezilo",
  "Bianor",
  "Bias",
  "Bibianus",
  "Biche",
  "Bidari",
  "Bide",
  "Bidun",
  "Bigelis",
  "Bihar",
  "Bikendi",
  "Bilbo",
  "Bilimer",
  "Bilintx",
  "Billebaut",
  "Bingen",
  "Binizo",
  "Bion",
  "Birila",
  "Birinus",
  "Birjaio",
  "Bisaltes",
  "Bisinus",
  "Biton",
  "Bittor",
  "Bitxintxo",
  "Bixente",
  "Bixintxo",
  "Bizi",
  "Bladi",
  "Blaise",
  "Blaive",
  "Blancandrin",
  "Blanko",
  "Blasius",
  "Blathyllos",
  "Blaze",
  "Blutmund",
  "Bob",
  "Bobbie",
  "Bobby",
  "Bobo",
  "Bobs",
  "Bochard",
  "Bodenolf",
  "Bodkin",
  "Bodo",
  "Bodolev",
  "Bodoloff",
  "Bodwine",
  "Boethius",
  "Boethus",
  "Bohle",
  "Boiorix",
  "Boje",
  "Boltof",
  "Bomilcar",
  "Bon-Ami",
  "Boneface",
  "Bonifacius",
  "Bonifatius",
  "Bonne",
  "Bonyface",
  "Boodes",
  "Borani",
  "Borchert",
  "Bordat",
  "Borjes",
  "Bortzaioriz",
  "Borus",
  "Boso",
  "Bostar",
  "Boter",
  "Botolfe",
  "Botolph",
  "Botulf",
  "Bouchard",
  "Bouke",
  "Bovo",
  "Braga",
  "Brandila",
  "Brantome",
  "Bretonnet",
  "Brianus",
  "Briareus",
  "Briarus",
  "Brice",
  "Bricet",
  "Briceus",
  "Bricot",
  "Brien",
  "Brienus",
  "Brison",
  "Britius",
  "Brocard",
  "Broder",
  "Bruiant",
  "Brune",
  "Bruno",
  "Brunte",
  "Bruyant",
  "Bryan",
  "Bryant",
  "Bryennius",
  "Brygos",
  "Bucoli",
  "Bulis",
  "Burchard",
  "Burconius",
  "Burel",
  "Burgundus",
  "Burkardus",
  "Burnel",
  "Burni",
  "Burrhus",
  "Burutzagi",
  "Buselin",
  "Butacidas",
  "Butilin",
  "Butlilinus",
  "Caine",
  "Callimachus",
  "Callimorphus",
  "Callinicus",
  "Calopodius",
  "Canbeus",
  "Candac",
  "Cannabas",
  "Cannabaudes",
  "Cantacuzenes",
  "Canute",
  "Canutus",
  "Cappi",
  "Capuel",
  "Carbo",
  "Carellus",
  "Carenos",
  "Carinus",
  "Carle",
  "Carloman",
  "Carlon",
  "Carneades",
  "Carpophorus",
  "Carpus",
  "Carthalo",
  "Casambus",
  "Caschin",
  "Casjen",
  "Caspar",
  "Cassyon",
  "Castinus",
  "Castor",
  "Ceas",
  "Cebriones",
  "Celeas",
  "Centule",
  "Cephalos",
  "Cepheus",
  "Cephissos",
  "Cerularius",
  "Cethegus",
  "Ceubasnus",
  "Ceufroy",
  "Ceyx",
  "Chabrias",
  "Chacili",
  "Chaeremon",
  "Chairophon",
  "Chal",
  "Chalcodon",
  "Chalcon",
  "Chalie",
  "Chalin",
  "Challemmeinne",
  "Challemoinne",
  "Challes",
  "Charax",
  "Charegiselus",
  "Chares",
  "Charibert",
  "Charidemos",
  "Charilaus",
  "Charillos",
  "Charle",
  "Charlemayn",
  "Charles",
  "Charlet",
  "Charlot",
  "Charlys",
  "Charmides",
  "Charon",
  "Charopos",
  "Chartain",
  "Chatbert",
  "Chazili",
  "Cheiron",
  "Cheldric",
  "Chenric",
  "Chernubles",
  "Chersis",
  "Chik",
  "Chilbudius",
  "Childebert",
  "Childebrand",
  "Childeric",
  "Chileos",
  "Chilon",
  "Chilperic",
  "Chindasuinth",
  "Chlodmer",
  "Chlodovech",
  "Chlodowig",
  "Chlotar",
  "Choerilos",
  "Choeros",
  "Chonrad",
  "Chremes",
  "Chremon",
  "Chremonides",
  "Chretzo",
  "Chrezzo",
  "Chrisogon",
  "Christoboulus",
  "Christophorus",
  "Chrodegang",
  "Chromis",
  "Chromius",
  "Chroniates",
  "Chrysaor",
  "Chryses",
  "Chrysippos",
  "Chrysogones",
  "Chrysogonus",
  "Chrysolorus",
  "Chustaffus",
  "Cilix",
  "Cineas",
  "Cinyras",
  "Ciprianus",
  "Cisses",
  "Cisseus",
  "Clair",
  "Clairac",
  "Clarebald",
  "Clarembald",
  "Clarembaut",
  "Claren",
  "Clarenbald",
  "Clarien",
  "Clarifant",
  "Clarin",
  "Clarus",
  "Claudien",
  "Cleades",
  "Cleandros",
  "Cleathes",
  "Cleisthenes",
  "Clem",
  "Clemens",
  "Clement",
  "Cleobulus",
  "Cleodaeos",
  "Cleombrotos",
  "Cleomenes",
  "Cleon",
  "Cleonicus",
  "Cleonymus",
  "Cleph",
  "Clerebald",
  "Clerenbald",
  "Climborin",
  "Climençon",
  "Climent",
  "Clinias",
  "Clisthenes",
  "Clodomir",
  "Clonius",
  "Clotaire",
  "Clothair",
  "Clovis",
  "Clymençon",
  "Clyment",
  "Clytius",
  "Clytomedes",
  "Cniva",
  "Cnivida",
  "Cnoethos",
  "Cobbo",
  "Cobon",
  "Codros",
  "Coenus",
  "Coeranus",
  "Coes",
  "Cois",
  "Colbert",
  "Colias",
  "Colluthus",
  "Comentas",
  "Comentiolus",
  "Cometas",
  "Comitas",
  "Comitiolus",
  "Conandus",
  "Conanus",
  "Conayn",
  "Conon",
  "Constans",
  "Constantianus",
  "Constantinianus",
  "Constantinus",
  "Cöon",
  "Copreus",
  "Corbinian",
  "Cordylion",
  "Corippus",
  "Cornel",
  "Cornelys",
  "Corney",
  "Coronos",
  "Corydallos",
  "Corydon",
  "Cosmas",
  "Costaine",
  "Costan",
  "Costane",
  "Costetine",
  "Costin",
  "Coumyn",
  "Courtois",
  "Cozard",
  "Crathis",
  "Cratinus",
  "Cratippus",
  "Crépin",
  "Crescentius",
  "Cresconius",
  "Cressant",
  "Cressin",
  "Cretheus",
  "Crethon",
  "Cretines",
  "Crios",
  "Crispian",
  "Crispianus",
  "Crispin",
  "Crispinian",
  "Crispinianus",
  "Crispinus",
  "Cristianus",
  "Crocus",
  "Croesus",
  "Cronos",
  "Crotila",
  "Cteatus",
  "Ctesippus",
  "Cudbert",
  "Cudbriht",
  "Cuddey",
  "Cuddie",
  "Cuddy",
  "Cunigast",
  "Cunimund",
  "Cuno",
  "Cunradus",
  "Cuphagoras",
  "Curincpert",
  "Curteis",
  "Cuthbrid",
  "Cyberniskos",
  "Cycnus",
  "Cylon",
  "Cynaegiros",
  "Cyncus",
  "Cyneas",
  "Cyniscus",
  "Cyon",
  "Cyprian",
  "Cypselos",
  "Cyr",
  "Cyrenios",
  "Cyriack",
  "Cyricus",
  "Cyril",
  "Cyrila",
  "Cytorissos",
  "Dabi",
  "Dadaces",
  "Dado",
  "Daedalos",
  "Daetor",
  "Dagilo",
  "Dagobert",
  "Dailus",
  "Daimbert",
  "Dalfin",
  "Dalmas",
  "Dalmatius",
  "Daluce",
  "Damasippus",
  "Damasithymos",
  "Damasos",
  "Damastor",
  "Damasus",
  "Damian",
  "Damianos",
  "Damianus",
  "Damiskos",
  "Dammo",
  "Damoetas",
  "Damon",
  "Danaos",
  "Danaus",
  "Danel",
  "Daniel",
  "Danielus",
  "Danje",
  "Danor",
  "Dapamort",
  "Daphis",
  "Daphnis",
  "Dardanus",
  "Dares",
  "Darius",
  "Daufari",
  "Daufer",
  "David",
  "Davos",
  "Decentius",
  "Decke",
  "Dederic",
  "Dederich",
  "Dederick",
  "Dedericus",
  "Deenes",
  "Deenys",
  "Degarre",
  "Degore",
  "Dei",
  "Deigenhardus",
  "Deinias",
  "Deinokrates",
  "Deinomenes",
  "Deiotones",
  "Deiphobus",
  "Deiphonous",
  "Deipylus",
  "Delion",
  "Demades",
  "Demaratos",
  "Demarmenos",
  "Demas",
  "Demeas",
  "Demetrios",
  "Democedes",
  "Democoön",
  "Demodocus",
  "Demokrates",
  "Demoleon",
  "Demonax",
  "Demonous",
  "Demophlos",
  "Demosthenes",
  "Denes",
  "Denisot",
  "Dennet",
  "Dennie",
  "Dennis",
  "Denny",
  "Denyse",
  "Denysot",
  "Deon",
  "Derek",
  "Derkylos",
  "Derric",
  "Derrick",
  "Deryk",
  "Detlef",
  "Deukalion",
  "Deunoro",
  "Deuterius",
  "Dexicos",
  "Dexios",
  "Diactorides",
  "Diadromes",
  "Diadumenus",
  "Diagoras",
  "Diagur",
  "Dicaeus",
  "Diccon",
  "Dick",
  "Dicke",
  "Dicken",
  "Dickie",
  "Dickon",
  "Dickory",
  "Dicky",
  "Didericus",
  "Didymus",
  "Diegotxe",
  "Dieneces",
  "Dieter",
  "Diggin",
  "Diggory",
  "Digne",
  "Digory",
  "Dimarus",
  "Diocles",
  "Diodoros",
  "Diodorus",
  "Diokles",
  "Diomedes",
  "Dionisius",
  "Dionysios",
  "Dionysophanes",
  "Dionysos",
  "Diophantus",
  "Diores",
  "Diosconis",
  "Dioscuros",
  "Diotrephes",
  "Dirk",
  "Dismas",
  "Distiratsu",
  "Dithyrambos",
  "Ditmarus",
  "Ditwinus",
  "Dmetor",
  "Dob",
  "Dobbin",
  "Dod",
  "Dodd",
  "Doddie",
  "Doddy",
  "Dodge",
  "Dodo",
  "Doete",
  "Dolfin",
  "Dolleo",
  "Dolon",
  "Dolops",
  "Domeka",
  "Domentziolus",
  "Domenyk",
  "Domianus",
  "Domiku",
  "Dominic",
  "Dominick",
  "Dominicus",
  "Dominix",
  "Dominy",
  "Domnicus",
  "Domninus",
  "Domnitziolus",
  "Donaldus",
  "Donat",
  "Donato",
  "Donestan",
  "Doneuuald",
  "Donnet",
  "Donostia",
  "Donston",
  "Donus",
  "Doolin",
  "Doreios",
  "Doreius",
  "Dorian",
  "Doriskos",
  "Dorjes",
  "Doros",
  "Dorotheus",
  "Doryssos",
  "Dosithios",
  "Draga",
  "Drest",
  "Dreu",
  "Dreue",
  "Dreues",
  "Dreux",
  "Drew",
  "Drewett",
  "Drimylos",
  "Droart",
  "Droet",
  "Drogo",
  "Dromeus",
  "Dro-on",
  "Droserius",
  "Drouet",
  "Droyn",
  "Dru",
  "Drue",
  "Druet",
  "Druettus",
  "Drugo",
  "Drust",
  "Dryas",
  "Dryops",
  "Drystan",
  "Dubius",
  "Ducetius",
  "Duche",
  "Duda",
  "Dudic",
  "Dudo",
  "Dudon",
  "Duihna",
  "Dukker",
  "Dulcissinuis",
  "Dulcitius",
  "Dump",
  "Dumphey",
  "Dumphry",
  "Dumpty",
  "Dunestan",
  "Dunixi Denis",
  "Durand",
  "Durandus",
  "Durant",
  "Duris",
  "Dye",
  "Dymas",
  "Dymnos",
  "Dynamius",
  "Dyonisius",
  "Dyryke",
  "Eadmund",
  "Eaduin",
  "Eaduuard",
  "Ealdred",
  "Ealdwine",
  "Eate",
  "Ebbo",
  "Eberhardus",
  "Ebermud",
  "Eberwolf",
  "Ebrardus",
  "Ebrimud",
  "Ebroin",
  "Ebrulf",
  "Eburhart",
  "Echëeus",
  "Echekrates",
  "Echelaos",
  "Echemmon",
  "Echemus",
  "Echephron",
  "Echepolus",
  "Echestratos",
  "Eck",
  "Eckardus",
  "Ecke",
  "Ecky",
  "Ede",
  "Edelstein",
  "Eden",
  "Eder",
  "Edica",
  "Edmod",
  "Edmond",
  "Edmundus",
  "Edon",
  "Edorta",
  "Edred",
  "Eduard",
  "Eduin",
  "Eduinus",
  "Edun",
  "Edur",
  "Eduuard",
  "Eduuin",
  "Eduuine",
  "Edward",
  "Edwardus",
  "Edzard",
  "Ee",
  "Eetion",
  "Eggihard",
  "Eggo",
  "Egidius",
  "Eginhardt",
  "Eginolf",
  "Egoi",
  "Egoitz",
  "Egon",
  "Eguen",
  "Eguerdi",
  "Egun",
  "Eguntsenti",
  "Eguzki",
  "Ehren",
  "Eicke",
  "Eicko",
  "Eidhart",
  "Eielt",
  "Eiffe",
  "Eigio",
  "Eilert",
  "Eilmer",
  "Einhard",
  "Einolfus",
  "Eioneus",
  "Eirenaios",
  "Ekain",
  "Ekaitz",
  "Ekhi",
  "Ekialde",
  "Elasus",
  "Elatos",
  "Elatreus",
  "Elazar",
  "Elbert",
  "Eldred",
  "Elduin",
  "Eleder",
  "Eleon",
  "Elephenor",
  "Elexander",
  "Elie",
  "Ellande",
  "Elmar",
  "Elmer",
  "Elorri",
  "Elpenor",
  "Elpides",
  "Elpidius",
  "Elshender",
  "Eluard",
  "Elured",
  "Eluret",
  "Elvin",
  "Elysandre",
  "Emambe",
  "Emaurri",
  "Emaus",
  "Embrico",
  "Emelricus",
  "Emenon",
  "Emercho",
  "Emeric",
  "Emerick",
  "Emericus",
  "Emery",
  "Emicho",
  "Emme",
  "Emmeran",
  "Emmerich",
  "Emond",
  "Emont",
  "Emory",
  "Empedocles",
  "Enaut",
  "Endemannus",
  "Endios",
  "Endira",
  "Endura",
  "Endymion",
  "Eneco",
  "Enego",
  "Eneko",
  "Enekoitz",
  "Eneto",
  "Enetz",
  "Engelard",
  "Engelier",
  "Engelke",
  "Engenes",
  "Engenouf",
  "Engeram",
  "Engeramus",
  "Engerramet",
  "Engerran",
  "Engerrand",
  "Engilbert",
  "Enguerran",
  "Enguerrand",
  "Enion",
  "Eniopus",
  "Enjorran",
  "Enjorren",
  "Ennaeus",
  "Enne",
  "Enno",
  "Ennodius",
  "Ennomus",
  "Ennychus",
  "Enops",
  "Enurchus",
  "Eos",
  "Epaenetus",
  "Epaphos",
  "Epaphroditus",
  "Epeigeus",
  "Epeius",
  "Ephialtes",
  "Epicurus",
  "Epicydes",
  "Epikrates",
  "Epimenes",
  "Epiphanes",
  "Epiphanius",
  "Epistor",
  "Epistrophos",
  "Epitrophos",
  "Epizelos",
  "Epowlett",
  "Eral",
  "Eraric",
  "Erart",
  "Erasistratus",
  "Eratosthenes",
  "Eratostheres",
  "Erauso",
  "Ercanbald",
  "Erchambaut",
  "Erchebald",
  "Erchembaut",
  "Erchenbaldus",
  "Erchinoald",
  "Erechtheus",
  "Ereinotz",
  "Erengier",
  "Eretmenus",
  "Ereuthalion",
  "Erginus",
  "Ergiyios",
  "Erichthonius",
  "Ericus",
  "Eriulf",
  "Eriz",
  "Erkenbaud",
  "Erlantz",
  "Erlembald",
  "Ermanaric",
  "Ermelandus",
  "Ermenoldus",
  "Ernald",
  "Ernaldus",
  "Ernaut",
  "Erneis",
  "Ernis",
  "Ernisius",
  "Ernold",
  "Ernoldus",
  "Ernolf",
  "Ernoul",
  "Ernoulet",
  "Ernoullet",
  "Ernst",
  "Ernust",
  "Erramu",
  "Erramun",
  "Errando",
  "Errapel",
  "Errolan",
  "Erroman",
  "Erruki",
  "Ertaut",
  "Eru",
  "Ervig",
  "Erwin",
  "Erxandros",
  "Eryalus",
  "Erysichton",
  "Eryx",
  "Eryximachos",
  "Escremiz",
  "Esdelot",
  "Esdert",
  "Eshmunazar",
  "Eskuin",
  "Esme",
  "Esmond",
  "Espan",
  "Espanelis",
  "Esprevere",
  "Estebe",
  "Estène",
  "Estmond",
  "Estorgan",
  "Estout",
  "Estramarin",
  "Eteocles",
  "Eteokles",
  "Eteonous",
  "Eteus",
  "Ethelbert",
  "Ethelmar",
  "Etienne",
  "Etor",
  "Etxahun",
  "Etxatxu",
  "Etxeberri",
  "Etxekopar",
  "Etxepare",
  "Euaemon",
  "Eualcidas",
  "Euanthes",
  "Euarestos",
  "Eubalus",
  "Eubulus",
  "Eucarpus",
  "Euchenor",
  "Eucleides",
  "Eudaemon",
  "Eude",
  "Eudes",
  "Eudon",
  "Eudorus",
  "Eudoxius",
  "Eudoxsus",
  "Eudoxus",
  "Eudropin",
  "Euenius",
  "Euenor",
  "Euenus",
  "Eugammon",
  "Eugenios",
  "Eugenius",
  "Euhemenis",
  "Euippus",
  "Eukles",
  "Eulalius",
  "Eulampius",
  "Eulogius",
  "Eumaeus",
  "Eumastas",
  "Eumelus",
  "Eumenes",
  "Eumneus",
  "Eumolpus",
  "Euneas",
  "Euonomos",
  "Eupalinus",
  "Eupatarius",
  "Euphemius",
  "Euphenes",
  "Euphorbos",
  "Euphorion",
  "Euphratas",
  "Euphronios",
  "Euphronius",
  "Eupolos",
  "Euric",
  "Euripides",
  "Euryanax",
  "Eurybates",
  "Eurybiades",
  "Eurycliedes",
  "Eurydamus",
  "Eurydemon",
  "Eurydemos",
  "Euryhus",
  "Eurykrates",
  "Eurykratides",
  "Euryleon",
  "Eurylochos",
  "Eurymachos",
  "Euryphon",
  "Eurypylos",
  "Eurystenes",
  "Eurysthenes",
  "Eurystheus",
  "Eurysthios",
  "Eurythion",
  "Eurytos",
  "Eusebius",
  "Eusko",
  "Eussorus",
  "Eustache",
  "Eustachius",
  "Eustacius",
  "Eustas",
  "Eustathius",
  "Eustochius",
  "Eustratius",
  "Eute",
  "Eutha",
  "Euthalius",
  "Eutharic",
  "Euthydemos",
  "Euthynos",
  "Eutolmius",
  "Eutropios",
  "Eutuches",
  "Eutychianus",
  "Eutychides",
  "Eutychius",
  "Eutychus",
  "Euvrouin",
  "Evaenetos",
  "Evagoras",
  "Evandros",
  "Evanetus",
  "Eve",
  "Evelthon",
  "Evenios",
  "Evenon",
  "Evenus",
  "Everardus",
  "Evert",
  "Everwinus",
  "Evios",
  "Evrardin",
  "Evrart",
  "Evrat",
  "Evrouin",
  "Evroul",
  "Evroult",
  "Ewmond",
  "Ewstace",
  "Exaduis",
  "Exekias",
  "Eylgar",
  "Ezkerra",
  "Eztebe",
  "Fabianus",
  "Fabien",
  "Fabyan",
  "Facco",
  "Fadiko",
  "Faenus",
  "Fairman",
  "Faldron",
  "Fallard",
  "Fameite",
  "Famète",
  "Fangeaux",
  "Faramond",
  "Faramund",
  "Fardulf",
  "Fareman",
  "Faremanne",
  "Farman",
  "Farmanus",
  "Farnobius",
  "Faro",
  "Faroald",
  "Farrimond",
  "Fastida",
  "Fastred",
  "Fato",
  "Fauques",
  "Faure",
  "Fawkes",
  "Féderic",
  "Féderyc",
  "Fehde",
  "Feletheus",
  "Felippe",
  "Felippo",
  "Felippot",
  "Feliz",
  "Felyse",
  "Ferand",
  "Ferant",
  "Ferentus",
  "Fermin",
  "Ferrand",
  "Ferrant",
  "Ferri",
  "Ferry",
  "Fersio",
  "Fersomeris",
  "Fery",
  "Feva",
  "Fiebras",
  "Fiehe",
  "Fiepto",
  "Fierelus",
  "Filibert",
  "Filimer",
  "Firman",
  "Firmin",
  "Firmine",
  "Firminus",
  "Firmo",
  "Fitel",
  "Fitellus",
  "Fithian",
  "Fizzilo",
  "Flaccitheus",
  "Flaco",
  "Flambard",
  "Flanbert",
  "Flavian",
  "Flodoard",
  "Floouen",
  "Florant",
  "Florence",
  "Florencius",
  "Florent",
  "Florentinus",
  "Florentius",
  "Flori",
  "Florian",
  "Floridee",
  "Floris",
  "Florivet",
  "Florus",
  "Fluellen",
  "Flurry",
  "Fluvant",
  "Focke",
  "Foke",
  "Folc",
  "Folcard",
  "Folke",
  "Folkert",
  "Folkes",
  "Folkher",
  "Folkmod",
  "Folmar",
  "Formerio",
  "Formosos",
  "Forsard",
  "Fortin",
  "Fortun",
  "Foucaud",
  "Foucaut",
  "Foucher",
  "Fouchier",
  "Foulk",
  "Foulque",
  "Foulqueret",
  "Fouquaut",
  "Fouque",
  "Fouqueret",
  "Fouques",
  "Fouquet",
  "Fourcaut",
  "Foursi",
  "Fowke",
  "Franceis",
  "Franceys",
  "Francio",
  "Franciscus",
  "Franco",
  "Francus",
  "Frankl",
  "Franque",
  "Franquet",
  "Frantzes",
  "Franz",
  "Fraomanius",
  "Fraunce",
  "Fraunk",
  "Fravitta",
  "Fray",
  "Fredegar",
  "Frederic",
  "Fredericus",
  "Frederik",
  "Freert",
  "Fremin",
  "Frerich",
  "Frery",
  "Freskin",
  "Fretela",
  "Fridebertus",
  "Fridebraht",
  "Frideric",
  "Fridericus",
  "Fridigern",
  "Fridolin",
  "Fridugis",
  "Fridurih",
  "Frigeridus",
  "Frilo",
  "Frithila",
  "Frithuric",
  "Fritigern",
  "Froila",
  "Fromondin",
  "Fromony",
  "Fructosus",
  "Fuabal",
  "Fuano",
  "Fulbert",
  "Fulbertus",
  "Fulchard",
  "Fulcher",
  "Fulco",
  "Fulgentius",
  "Fulk",
  "Fulke",
  "Fulko",
  "Fullofaudes",
  "Fulrad",
  "Fyrmyn",
  "Gabirel",
  "Gabo",
  "Gabon",
  "Gabrielius",
  "Gadaric",
  "Gadfrid",
  "Gagino",
  "Gahariet",
  "Gai",
  "Gaiallard",
  "Gaido",
  "Gaidon",
  "Gaifer",
  "Gaillard",
  "Gaillart",
  "Gainas",
  "Gairbert",
  "Gairebold",
  "Gairhard",
  "Gairovald",
  "Gaiseric",
  "Gaitzka",
  "Gaizka",
  "Gaizkine",
  "Gaizko",
  "Galafe",
  "Galafre",
  "Gale",
  "Galefridus",
  "Galenus",
  "Galeran",
  "Galeren",
  "Gales",
  "Galfridus",
  "Galien",
  "Galindo",
  "Galindus",
  "Gallien",
  "Gallienus",
  "Gallus",
  "Galoer",
  "Galot",
  "Galter",
  "Galterius",
  "Gamelin",
  "Gamelinus",
  "Gamellus",
  "Gamelus",
  "Gammell",
  "Ganelon",
  "Ganix",
  "Ganymedes",
  "Gar",
  "Garaile",
  "Garaona",
  "Garbrand",
  "Garibald",
  "Garikoitz",
  "Garin",
  "Garit",
  "Garner",
  "Garnet",
  "Garnier",
  "Garnot",
  "Garnotin",
  "Garoa",
  "Garrat",
  "Garratt",
  "Garrelt",
  "Garrett",
  "Garrit",
  "Garsille",
  "Gartxot",
  "Gartzea",
  "Gartzen",
  "Gartzi",
  "Gascot",
  "Gaskon",
  "Gasteiz",
  "Gastne",
  "Gaston",
  "Gau",
  "Gauanes",
  "Gauargi",
  "Gaubert",
  "Gauchier",
  "Gaude",
  "Gaudinus",
  "Gaueko",
  "Gaufrid",
  "Gaufridus",
  "Gaufroi",
  "Gauguein",
  "Gaumardas",
  "Gaur",
  "Gaut",
  "Gautbehrt",
  "Gautelen",
  "Gauterit",
  "Gauteron",
  "Gautier",
  "Gautzelin",
  "Gauvain",
  "Gauzelen",
  "Gauzpert",
  "Gavienus",
  "Gavin",
  "Gavinus",
  "Gawayne",
  "Gawen",
  "Gawin",
  "Gawn",
  "Gawne",
  "Gawter",
  "Gawyn",
  "Gawyne",
  "Gaxan",
  "Gaylord",
  "Gaztea",
  "Gebahard",
  "Geberic",
  "Gebhard",
  "Geboin",
  "Gebun",
  "Geerd",
  "Geertt",
  "Geffe",
  "Geffery",
  "Geffrai",
  "Geffray",
  "Geffrei",
  "Geffrey",
  "Geffroi",
  "Gefroi",
  "Gefroy",
  "Geike",
  "Geleon",
  "Gelfradus",
  "Gelimer",
  "Gelis",
  "Gelo",
  "Gelon",
  "Gelther",
  "Gemalfin",
  "Gembert",
  "Gemmel",
  "Genethlius",
  "Gennadios",
  "Gennadius",
  "Gentian",
  "Gentien",
  "Gento",
  "Gentza",
  "Geoff",
  "Geoffrey",
  "Geoffroi",
  "Geofridus",
  "Geordie",
  "George",
  "Georgie",
  "Georgius",
  "Georgus",
  "Georgy",
  "Ger",
  "Gerald",
  "Geraldo",
  "Geraldus",
  "Gerard",
  "Gerardus",
  "Gerasimos",
  "Gerazan",
  "Gerbert",
  "Gerbertus",
  "Gerbodo",
  "Gerbotho",
  "Gerente",
  "Gereon",
  "Gerfast",
  "Gergori",
  "Gerhardus",
  "Gerhart",
  "Gerier",
  "Gerin",
  "Gerjet",
  "Gerlach",
  "Gerlacus",
  "Gerland",
  "Germanus",
  "Gernandus",
  "Gerner",
  "Gernier",
  "Gero",
  "Gerold",
  "Geroldin",
  "Geroldus",
  "Gerolt",
  "Gerontius",
  "Gerould",
  "Gerrart",
  "Gerrit",
  "Gerulf",
  "Gerung",
  "Geruntius",
  "Gervais",
  "Gervaise",
  "Gervas",
  "Gervasius",
  "Gervassius",
  "Gervès",
  "Gervèse",
  "Gervesin",
  "Gervesot",
  "Gervis",
  "Gerwald",
  "Gesalec",
  "Gesimund",
  "Getica",
  "Geuffroi",
  "Geve",
  "Gevehard",
  "Gib",
  "Gibbon",
  "Gibby",
  "Gide",
  "Gidie",
  "Gieffrinnet",
  "Gifardus",
  "Gifartus",
  "Gifemund",
  "Giff",
  "Gifford",
  "Gigo",
  "Gil",
  "Gilamu",
  "Gilberd",
  "Gilbertus",
  "Gildon",
  "Gile",
  "Gilebert",
  "Gilebertus",
  "Gilebin",
  "Gilen",
  "Gilesindo",
  "Gilet",
  "Gilibertus",
  "Gilius",
  "Gill",
  "Gillebertus",
  "Gilles",
  "Gillet",
  "Gilliame",
  "Gillius",
  "Gillot",
  "Gillotin",
  "Gilmyn",
  "Gilon",
  "Gilonem",
  "Gilot",
  "Gilow",
  "Gilpin",
  "Gimmo",
  "Giorgius",
  "Gipp",
  "Giradin",
  "Giraldus",
  "Girard",
  "Girardus",
  "Girars",
  "Girart",
  "Giraud",
  "Giraudus",
  "Giraut",
  "Girbers",
  "Giregilo",
  "Giriaume",
  "Girk",
  "Giro",
  "Giroldus",
  "Girout",
  "Giselberdus",
  "Giseler",
  "Gisfrid",
  "Gisilbehrt",
  "Gisilbert",
  "Gislebertus",
  "Giso",
  "Gisulf",
  "Gizon",
  "Glaukias",
  "Glaukos",
  "Glaumunt",
  "Glauperaht",
  "Glycerius",
  "Glycon",
  "Gnipho",
  "Goar",
  "Gobelin",
  "Gobert",
  "Gobin",
  "Goce",
  "Gocelinus",
  "Godafre",
  "Godafried",
  "Godard",
  "Godart",
  "Godbert",
  "Goddas",
  "Godebert",
  "Godefray",
  "Godefridus",
  "Godefroi",
  "Godefroy",
  "Godefry",
  "Godegisel",
  "Godehard",
  "Godeheard",
  "Godelot",
  "Godepert",
  "Godesmannus",
  "Godet",
  "Godewinus",
  "Godfery",
  "Godfree",
  "Godfreed",
  "Godfrey",
  "Godfry",
  "Godichal",
  "Godigisclus",
  "Godila",
  "Godilas",
  "Godin",
  "Godobald",
  "Godohelm",
  "Godscalcus",
  "Goduin",
  "Goduine",
  "Godun",
  "Godvynus",
  "Goeuuin",
  "Goffridus",
  "Gogo",
  "Goi",
  "Goiaricus",
  "Goin",
  "Goisfrid",
  "Goisfridus",
  "Goiz",
  "Goizeder",
  "Goldin",
  "Goldine",
  "Golding",
  "Goldkopf",
  "Golduin",
  "Goldwyn",
  "Golias",
  "Gomeric",
  "Gomesano",
  "Gonfroi",
  "Gontier",
  "Gora",
  "Gorbea",
  "Gordias",
  "Goren",
  "Gorgias",
  "Gorgion",
  "Gorgos",
  "Gorgythion",
  "Gorka",
  "Gorosti",
  "Gorri",
  "Gosbert",
  "Goscelin",
  "Goscelinus",
  "Gosfridus",
  "Gotteschalk",
  "Gottschalk",
  "Gotwinus",
  "Gotzon",
  "Gotzstaf",
  "Goubert",
  "Goumelet",
  "Gourdet",
  "Gouththas",
  "Gouzlim",
  "Gozbert",
  "Gozelinus",
  "Gozolon",
  "Gracien",
  "Gracyen",
  "Gralam",
  "Grandoye",
  "Granville",
  "Gratian",
  "Grawo",
  "Grefin",
  "Greg",
  "Grege",
  "Gregoras",
  "Gregorius",
  "Gregour",
  "Grenville",
  "Grifo",
  "Grifon",
  "Grigge",
  "Grimald",
  "Grimaldus",
  "Grimbald",
  "Grimbaldus",
  "Grimbaud",
  "Grimbol",
  "Grimbold",
  "Grimoald",
  "Grimold",
  "Gringoire",
  "Gris",
  "Grisigion",
  "Grisigon",
  "Gryllus",
  "Gualter",
  "Gualterius",
  "Gualtier",
  "Guarin",
  "Guarinet",
  "Guarinus",
  "Guarnier",
  "Guenes",
  "Guérart",
  "Gueri",
  "Guérin",
  "Guerinnet",
  "Guermont",
  "Guernier",
  "Guernon",
  "Guernot",
  "Gui",
  "Guiart",
  "Guibe",
  "Guibert",
  "Guibour",
  "Guichard",
  "Guido",
  "Guigue",
  "Guilhabert",
  "Guilhem",
  "Guilielm",
  "Guillame",
  "Guillaume",
  "Guille",
  "Guillelmus",
  "Guillemaque",
  "Guillemet",
  "Guillemin",
  "Guillemot",
  "Guillot",
  "Guillotin",
  "Guimar",
  "Guimart",
  "Guimer",
  "Guimond",
  "Guineboud",
  "Guinemant",
  "Guinemanz",
  "Guinemar",
  "Guinemat",
  "Guiot",
  "Guiraud",
  "Guiraudet",
  "Guiscard",
  "Guischard",
  "Gumpert",
  "Gundehar",
  "Gundiok",
  "Gundo",
  "Gundoald",
  "Gundobad",
  "Gundobald",
  "Gunnulf",
  "Guntard",
  "Gunter",
  "Gunteric",
  "Gunterius",
  "Gunterus",
  "Gunthar",
  "Gunthigis",
  "Guntmar",
  "Guntramn",
  "Guntramus",
  "Gunutz",
  "Gunzelinus",
  "Gurgos",
  "Gurutz",
  "Gusso",
  "Gutthikas",
  "Gutxi",
  "Guyat",
  "Guymar",
  "Guyon",
  "Gwalter",
  "Gwatkin",
  "Gwychardus",
  "Gwydo",
  "Gy",
  "Gyffard",
  "Gylaw",
  "Gylbard",
  "Gylbarde",
  "Gylbart",
  "Gylippos",
  "Gylis",
  "Gylmyne",
  "Gylys",
  "Gyrard",
  "Gyras",
  "Gyrtias",
  "Haat",
  "Hab",
  "Habbe",
  "Habbie",
  "Habbo",
  "Habreham",
  "Hacon",
  "Hacun",
  "Hadubrand",
  "Haemon",
  "Hagarih",
  "Hagen",
  "Haggith",
  "Hagias",
  "Hagilo",
  "Hagnon",
  "Haguin",
  "Haiete",
  "Haimirich",
  "Haimmon",
  "Haimo",
  "Haimona",
  "Hairud",
  "Haitz",
  "Hal",
  "Halebran",
  "Halinard",
  "Halisthertes",
  "Halius",
  "Halo",
  "Haluin",
  "Ham",
  "Hamelen",
  "Hamelin",
  "Hameline",
  "Hamelot",
  "Hamen",
  "Hamett",
  "Hamilax",
  "Hamilcar",
  "Hamiscora",
  "Hamlet",
  "Hamlin",
  "Hamlyn",
  "Hammond",
  "Hamnet",
  "Hamon",
  "Hamond",
  "Hamonet",
  "Hampsicora",
  "Hamund",
  "Handi",
  "Hank",
  "Hankin",
  "Hann",
  "Hannes",
  "Hanni",
  "Hannibal",
  "Hannibalianus",
  "Hanno",
  "Hannon",
  "Hano",
  "Hanot",
  "Hanry",
  "Hans-Ruedi",
  "Hapertus",
  "Haquin",
  "Harald",
  "Haraldus",
  "Harber",
  "Harbert",
  "Harchier",
  "Harde",
  "Hardegin",
  "Hardi",
  "Harding",
  "Hardouin",
  "Harduinus",
  "Haribehrt",
  "Hariberct",
  "Hariman",
  "Harimann",
  "Haritz",
  "Haritzeder",
  "Hariwald",
  "Harkaitz",
  "Harm",
  "Harman",
  "Harmatidas",
  "Harmocydes",
  "Harmodios",
  "Harmon",
  "Haroldus",
  "Harpagos",
  "Harpalion",
  "Harpalos",
  "Harpernus",
  "Harpocras",
  "Harri",
  "Harry",
  "Hartmannus",
  "Hartmudus",
  "Hartmut",
  "Hartz",
  "Hary",
  "Hascouf",
  "Hasdrubal",
  "Hats",
  "Hauwe",
  "Haveron",
  "Hawkin",
  "Haymo",
  "Hebert",
  "Hecataeus",
  "Hecelin",
  "Hedlef",
  "Hegesandros",
  "Hegesistratos",
  "Hegetoridas",
  "Hegoi",
  "Heibert",
  "Heidolfus",
  "Heimart",
  "Heimeri",
  "Heimerich",
  "Heimon",
  "Heine",
  "Heinricus",
  "Heinz",
  "Heirax",
  "Heiron",
  "Hektor",
  "Helain",
  "Heldebald",
  "Heldefredus",
  "Helenos",
  "Helfricus",
  "Helgaud",
  "Helgesippos",
  "Helgot",
  "Helicaon",
  "Helinand",
  "Heliodorus",
  "Helios",
  "Helisachar",
  "Helladius",
  "Helle",
  "Helmhart",
  "Helouyn",
  "Heloynet",
  "Hemarc",
  "Hemart",
  "Hemeri",
  "Hemmet",
  "Hemmo",
  "Hemonnet",
  "Hendereye",
  "Hendry",
  "Hene",
  "Henffen",
  "Henfrey",
  "Henko",
  "Hennsmann",
  "Henricus",
  "Henriet",
  "Henriot",
  "Henseus",
  "Hephaestos",
  "Heraclius",
  "Herakleides",
  "Herakleitos",
  "Heraklides",
  "Heral",
  "Herald",
  "Herauso",
  "Herbelot",
  "Herbertus",
  "Herbrand",
  "Herchembaut",
  "Herchier",
  "Herculles",
  "Herebert",
  "Herensuge",
  "Hereuuard",
  "Herewardus",
  "Herewart",
  "Heribehrt",
  "Heribert",
  "Heribrand",
  "Herilo",
  "Heriot",
  "Hérique",
  "Herluin",
  "Herman",
  "Hermangild",
  "Hermannus",
  "Hermeias",
  "Hermenfred",
  "Hermenigild",
  "Hermenion",
  "Herment",
  "Hermeros",
  "Herminafrid",
  "Hermippos",
  "Hermogenes",
  "Hermolaos",
  "Hermolycus",
  "Hermon",
  "Hermongenes",
  "Hermotimos",
  "Hernais",
  "Hernaudin",
  "Hernaut",
  "Hernays",
  "Hernegliscus",
  "Hernouet",
  "Hero",
  "Herodes",
  "Herodianus",
  "Herodion",
  "Herold",
  "Herolt",
  "Heromenes",
  "Herould",
  "Herriot",
  "Herry",
  "Hertwicus",
  "Heruuord",
  "Herve",
  "Herveus",
  "Hervey",
  "Hervi",
  "Herviet",
  "Hervisse",
  "Hervoet",
  "Hervouet",
  "Hervy",
  "Hesdin",
  "Hétouyn",
  "Hetzkinus",
  "Heude",
  "Heudebrand",
  "Heurle",
  "Hew",
  "Hewe",
  "Hewelet",
  "Hewelin",
  "Hewerald",
  "Hewet",
  "Hewlett",
  "Heymeri",
  "Heymon",
  "Hibai",
  "Hibbe",
  "Hibbo",
  "Hicetaon",
  "Hick",
  "Hicket",
  "Hickie",
  "Hiero",
  "Hieronymus",
  "Higg",
  "Hildebad",
  "Hildebald",
  "Hildeberht",
  "Hildebold",
  "Hildebrand",
  "Hildebrandus",
  "Hildebrant",
  "Hildebrondus",
  "Hildegaud",
  "Hildeprand",
  "Hilderic",
  "Hilderith",
  "Hildibrand",
  "Hildigis",
  "Hilduin",
  "Hilfert",
  "Hilmagis",
  "Himel",
  "Himerius",
  "Himi",
  "Himilco",
  "Himnerith",
  "Hincmar",
  "Hinrich",
  "Hipparchos",
  "Hipparinos",
  "Hippasus",
  "Hippias",
  "Hippocoön",
  "Hippoklides",
  "Hippokratides",
  "Hippolytos",
  "Hippomachos",
  "Hippomenes",
  "Hippon",
  "Hipponax",
  "Hipponicus",
  "Hipponous",
  "Hippotas",
  "Hippothous",
  "Hippotion",
  "Hique",
  "Hiram",
  "Hiruz",
  "Hisarna",
  "Hitch",
  "Hitchcock",
  "Hitz",
  "Hitzeder",
  "Hlodver",
  "Hluodohari",
  "Hluodowig",
  "Hnaufridus",
  "Hob",
  "Hobard",
  "Hobb",
  "Hobbie",
  "Hocequin",
  "Hodei",
  "Hodge",
  "Hodgkin",
  "Hohepa",
  "Hoiples",
  "Hokianga",
  "Holger",
  "Holiver",
  "Holo",
  "Homeros",
  "Hone",
  "Honfroi",
  "Honoratus",
  "Honoré",
  "Honorius",
  "Honot",
  "Hootje",
  "Hori",
  "Hosbertus",
  "Hosebert",
  "Hosmundus",
  "Hosmunt",
  "Hotch",
  "Hotu",
  "Hotys",
  "Hotz",
  "Houdart",
  "Houdéet",
  "Houdin",
  "Houdoin",
  "Houdouyn",
  "How",
  "Howard",
  "Howkin",
  "Hraban",
  "Hremfing",
  "Hroch",
  "Hrodebert",
  "Hrodgar",
  "Hrodgaud",
  "Hrodger",
  "Hrodo",
  "Hrodric",
  "Hrodrich",
  "Hrodulf",
  "Hrotmar",
  "Hrudolf",
  "Hruodiger",
  "Hruodland",
  "Hruodpehrt",
  "Huard",
  "Huart",
  "Hubard",
  "Hubelet",
  "Hubertus",
  "Hubie",
  "Huchon",
  "Hud",
  "Hudd",
  "Hudde",
  "Hue",
  "Huebald",
  "Huelin",
  "Huet",
  "Huffie",
  "Hugelin",
  "Huget",
  "Hugethun",
  "Huggett",
  "Huggin",
  "Hugh",
  "Hughoc",
  "Hugi",
  "Hugin",
  "Hugline",
  "Hugo",
  "Hugolinus",
  "Hugon",
  "Huguard",
  "Hugubehrt",
  "Hugubert",
  "Hugue",
  "Huguenin",
  "Hugues",
  "Huguet",
  "Huidelon",
  "Huidemar",
  "Huirangi",
  "Huitace",
  "Hulmul",
  "Humbert",
  "Humfery",
  "Humfredus",
  "Humfrey",
  "Humfridus",
  "Humfrye",
  "Huml",
  "Humph",
  "Humpherus",
  "Humphery",
  "Humphrey",
  "Humpty",
  "Hunald",
  "Hunberct",
  "Huneric",
  "Hunfray",
  "Hunfrid",
  "Hunfridus",
  "Hunigild",
  "Hunimund",
  "Hunout",
  "Hunulf",
  "Hunumund",
  "Huolo",
  "Huon",
  "Huoul",
  "Hupertus",
  "Hurko",
  "Hurmio",
  "Huroin",
  "Hurrey",
  "Hustaz",
  "Hutch",
  "Hutchin",
  "Hyakinthos",
  "Hydatius",
  "Hylas",
  "Hyllos",
  "Hyllus",
  "Hypatius",
  "Hypeirochus",
  "Hypenor",
  "Hyperenor",
  "Hyperion",
  "Hypsenor",
  "Hyrcanus",
  "Hyrtacus",
  "Hyrtius",
  "Iacobus",
  "Iakchos",
  "Iaki",
  "Ialmenes",
  "Iambulus",
  "Iamus",
  "Ianto",
  "Ianuarius",
  "Iasos",
  "Iatragoras",
  "Iatrokles",
  "Iban",
  "Ibanolis",
  "Ibar",
  "Ibba",
  "Ibon",
  "Ibykos",
  "Icarion",
  "Icarius",
  "Icarus",
  "Idaeus",
  "Idaios",
  "Idas",
  "Idomeneus",
  "Ieltxu",
  "Ifebrand",
  "Ignace",
  "Ignatius",
  "Igon",
  "Ihazintu",
  "Ihintza",
  "Ihmel",
  "Iigo",
  "Ikatz",
  "Iker",
  "Ilari",
  "Ilazki",
  "Ilberd",
  "Ilbert",
  "Ilbertus",
  "Ildebad",
  "Ilioneus",
  "Ilixo",
  "Illart",
  "Illyrius",
  "Ilus",
  "Imanol",
  "Imbart",
  "Imbert",
  "Imbertus",
  "Imbrasus",
  "Imbrius",
  "Imbrus",
  "Imgelramus",
  "Imninon",
  "Inachos",
  "Inachus",
  "Inaki",
  "Inaros",
  "Inautzi",
  "Indar",
  "Indartsu",
  "Inge",
  "Ingelram",
  "Ingelramnus",
  "Ingelrandus",
  "Ingelrannus",
  "Ingeram",
  "Ingerame",
  "Ingraham",
  "Ingram",
  "Ingramus",
  "Ingran",
  "Ingrannus",
  "Inguma",
  "Inigo",
  "Inko",
  "Inna",
  "Innocentius",
  "Intxixu",
  "Iobates",
  "Ioco",
  "Iolaos",
  "Iollas",
  "Ion",
  "Ionnacius",
  "Ionnes",
  "Iordanes",
  "Ioritz",
  "Ioseph",
  "Iosephius",
  "Iosephus",
  "Iovinus",
  "Iovivus",
  "Ipar",
  "Iparragirre",
  "Iphiclus",
  "Iphicrates",
  "Iphikrates",
  "Iphinous",
  "Iphitos",
  "Iphitus",
  "Ipolitus",
  "Ippolitus",
  "Ippollitt",
  "Iraitz",
  "Iratxo",
  "Iratze",
  "Iratzeder",
  "Iraunkor",
  "Irenaeus",
  "Irnerius",
  "Irnfried",
  "Iros",
  "Irrintzi",
  "Iruinea",
  "Irus",
  "Isaaces",
  "Isaacius",
  "Isagoras",
  "Isambard",
  "Isandros",
  "Ischenous",
  "Isembard",
  "Isembart",
  "Isemberd",
  "Isembert",
  "Isenbard",
  "Isenbardus",
  "Isidor",
  "Isidoros",
  "Isidorus",
  "Ision",
  "Ismaros",
  "Ismenios",
  "Iso",
  "Isocrates",
  "Isodemos",
  "Isokrates",
  "Isore",
  "Isusko",
  "Itheus",
  "Iturri",
  "Itxaso",
  "Itylus",
  "Itys",
  "Itzaina",
  "Itziar",
  "Ive",
  "Ivo",
  "Ivon",
  "Ivone",
  "Ivor",
  "Ivote",
  "Ivvanus",
  "Ixaka",
  "Ixidor",
  "Ixona",
  "Izaskun",
  "Izotz",
  "Iztal",
  "Jabbe",
  "Jabbo",
  "Jabnit",
  "Jacobo",
  "Jacquelin",
  "Jaime",
  "Jaizki",
  "Jakelin",
  "Jakes",
  "Jakobe",
  "Jakue",
  "Jal",
  "Jangleu",
  "Janpier",
  "Janto",
  "Japhet",
  "Jarto",
  "Jarvis",
  "Jasce",
  "Jasone",
  "Jatsu",
  "Jaunti",
  "Jaunzuria",
  "Jean",
  "Jeff",
  "Jeffcock",
  "Jeffery",
  "Jeffroy",
  "Jeffry",
  "Jehan",
  "Jeharraz",
  "Jehaue",
  "Jelde",
  "Jellrich",
  "Jellste",
  "Jenico",
  "Jep",
  "Jeph",
  "Jeremi",
  "Jervis",
  "Jessamy",
  "Jevan",
  "Jewell",
  "Jibbe",
  "Jibbo",
  "Jilde",
  "Joannes",
  "Job",
  "Jobba",
  "Joce",
  "Jocelin",
  "Jocelyn",
  "Jocet",
  "Joceus",
  "Joçon",
  "Jodocus",
  "Joel",
  "Joeli",
  "Joffridus",
  "Jofridus",
  "Johan",
  "Johannes",
  "John",
  "Johun",
  "Jokin",
  "Jolanus",
  "Joldewin",
  "Jolin",
  "Jolis",
  "Jollan",
  "Jollanus",
  "Jollivet",
  "Jolyon",
  "Jonas",
  "Jonathas",
  "Jop",
  "Joppa",
  "Joppo",
  "Jordanes",
  "Joren",
  "Jorin",
  "Joris",
  "Josce",
  "Joscelin",
  "Joscelyn",
  "Josclyn",
  "Joseba",
  "Josepe",
  "Joss",
  "Josse",
  "Josson",
  "Josu",
  "Jourdain",
  "Jowell",
  "Jozeran",
  "Juan",
  "Juaneizu",
  "Juango",
  "Juantxiki",
  "Judbert",
  "Jude",
  "Judo",
  "Juel",
  "Juerg",
  "Julen",
  "Jules",
  "Julf",
  "Julianus",
  "Julien",
  "Julyan",
  "Jumel",
  "Jupp",
  "Jurdan",
  "Jurfaret",
  "Jurg",
  "Jurgi",
  "Jurke",
  "Juste",
  "Kacili",
  "Kadmos",
  "Kaenas",
  "Kaeneus",
  "Kahu",
  "Kahumanu",
  "Kahutea",
  "Kai",
  "Kaiet",
  "Kalchas",
  "Kalesius",
  "Kaletor",
  "Kalliaros",
  "Kallias",
  "Kallikles",
  "Kallikrates",
  "Kallimachos",
  "Kallinicus",
  "Kallinos",
  "Kallipides",
  "Kallipos",
  "Kallisthenes",
  "Kallon",
  "Kameirus",
  "Kamira",
  "Kandaules",
  "Kandaulo",
  "Kannadis",
  "Kapaneus",
  "Kapys",
  "Karipos",
  "Karles",
  "Karmel",
  "Karolus",
  "Karopophores",
  "Kasen",
  "Kasos",
  "Kassandros",
  "Kauldi",
  "Kaunos",
  "Kaxen",
  "Kebalinos",
  "Kebes",
  "Kekrops",
  "Kelemen",
  "Kelmen",
  "Kemen",
  "Kenard",
  "Kendrick",
  "Keneweard",
  "Kenewrec",
  "Kennard",
  "Kenric",
  "Kenricus",
  "Kenweard",
  "Kenwrec",
  "Keop",
  "Keos",
  "Kepa",
  "Kephalon",
  "Kephalos",
  "Kerameikos",
  "Kereama",
  "Kerehi",
  "Kerkyon",
  "Kerrich",
  "Keteus",
  "Kiliz",
  "Kimetz",
  "Kimon",
  "Kirphis",
  "Kismi",
  "Kittos",
  "Klaes",
  "Klaus",
  "Kleitos",
  "Kleobis",
  "Kleomenes",
  "Koert",
  "Kohuru",
  "Koines",
  "Koinos",
  "Koldo",
  "Koldobika",
  "Konon",
  "Koob",
  "Koragos",
  "Korax",
  "Kosmas",
  "Krantor",
  "Krateros",
  "Kreon",
  "Krinippos",
  "Krino",
  "Kristos",
  "Kritias",
  "Kritoboulos",
  "Kritodemos",
  "Kriton",
  "Kroisos",
  "Krokinos",
  "Ktesiphon",
  "Kuonrat",
  "Kupe",
  "Kusko",
  "Kyknos",
  "Kynaegeiros",
  "Kyrillos",
  "Kyrios",
  "Kyros",
  "Labdacus",
  "Labotas",
  "Lactanius",
  "Ladislaus",
  "Laertes",
  "Lafele",
  "Lagariman",
  "Lagos",
  "Lagot",
  "Laiamicho",
  "Laico",
  "Lain",
  "Laios",
  "Lallo",
  "Lamachos",
  "Lambard",
  "Lambekin",
  "Lambelin",
  "Lambequin",
  "Lambert",
  "Lambertus",
  "Lambin",
  "Lambkin",
  "Lamissio",
  "Lammert",
  "Lampo",
  "Lampon",
  "Lampridius",
  "Lampus",
  "Lamus",
  "Lancelet",
  "Lancelin",
  "Lancelot",
  "Lancelyn",
  "Landebert",
  "Lander",
  "Landico",
  "Lando",
  "Landoberct",
  "Landri",
  "Lanfranc",
  "Lanslet",
  "Lanzo",
  "Laodamas",
  "Laodocus",
  "Laogonus",
  "Laomedon",
  "Laphanes",
  "Lapurdi",
  "Larance",
  "Larendi",
  "Larenz",
  "Larkin",
  "Larra",
  "Lartaun",
  "Laskaris",
  "Lasos",
  "Lasthenes",
  "Lastur",
  "Latinius",
  "Lauaxeta",
  "Laudus",
  "Launce",
  "Launceletus",
  "Launcelot",
  "Launobaudus",
  "Launselot",
  "Launus",
  "Laureion",
  "Laurencius",
  "Laurent",
  "Laurentius",
  "Laurentzi",
  "Laurgain",
  "Laurin",
  "Lawrence",
  "Leagros",
  "Léal",
  "Leandros",
  "Learchos",
  "Leavold",
  "Lebuin",
  "Lecapenus",
  "Ledger",
  "Leert",
  "Leferich",
  "Leffeyne",
  "Lefric",
  "Lefrich",
  "Lefricus",
  "Lefuuinus",
  "Lefwinus",
  "Lefwyne",
  "Leger",
  "Lehen",
  "Leheren",
  "Lehior",
  "Lehoi",
  "Leicritus",
  "Leigh",
  "Leitus",
  "Leizarraga",
  "Lekubegi",
  "Lel",
  "Lemnus",
  "Lennard",
  "Lennor",
  "Lentfridus",
  "Leo",
  "Leocedes",
  "Leodegar",
  "Leodes",
  "Leofard",
  "Leofricus",
  "Leofuuin",
  "Leofuuinus",
  "Leoiar",
  "Leon",
  "Leonardus",
  "Leonel",
  "Leonhard",
  "Leonidas",
  "Leonidem",
  "Leonnatos",
  "Leontiades",
  "Leontis",
  "Leontius",
  "Leoprepes",
  "Leoric",
  "Leotychides",
  "Leouric",
  "Leouuinus",
  "Leovigild",
  "Ler",
  "Lertxun",
  "Letard",
  "Lethos",
  "Leucippus",
  "Leudbald",
  "Leufred",
  "Leufroy",
  "Leukos",
  "Leuric",
  "Leutfrid",
  "Leuthere",
  "Leuuin",
  "Leuuine",
  "Leuvibild",
  "Leveridge",
  "Levin",
  "Lewenhart",
  "Lewin",
  "Lewine",
  "Lewis",
  "Liafwine",
  "Lichas",
  "Licymnios",
  "Lie",
  "Liebte",
  "Lièce",
  "Liellus",
  "Lienart",
  "Ligart",
  "Ligier",
  "Liher",
  "Lijart",
  "Linus",
  "Lion",
  "Lionet",
  "Liudhard",
  "Liudolf",
  "Liukardis",
  "Liulf",
  "Liutbald",
  "Liutbalt",
  "Liutpert",
  "Liutprand",
  "Liutward",
  "Livila",
  "Lizar",
  "Lizardi",
  "Lo",
  "Lodewicus",
  "Loert",
  "Lohitzun",
  "Loiola",
  "Lon",
  "Looys",
  "Lope",
  "Loramendi",
  "Lordi",
  "Lore",
  "Loren",
  "Lorence",
  "Lorencin",
  "Lorens",
  "Lorent",
  "Lorenz",
  "Lori",
  "Lorrenz",
  "Lothar",
  "Loup",
  "Louth",
  "Louve",
  "Louvel",
  "Love",
  "Lovel",
  "Lovell",
  "Loverich",
  "Loverick",
  "Lovet",
  "Lowis",
  "Lowrens",
  "Lowrie",
  "Loxias",
  "Loys",
  "Loyset",
  "Luar",
  "Lubbert",
  "Lucianus",
  "Lucien",
  "Ludewicus",
  "Ludoldus",
  "Ludovicus",
  "Ludwig",
  "Luhre",
  "Luitfridus",
  "Luitgarde",
  "Luitpold",
  "Luix",
  "Luk",
  "Luken",
  "Luki",
  "Lukos",
  "Lul",
  "Luli",
  "Lull",
  "Luppe",
  "Lutet",
  "Lutjen",
  "Luzaide",
  "Luzea",
  "Lvfridus",
  "Lycaon",
  "Lycaretos",
  "Lycidas",
  "Lycomedes",
  "Lycophon",
  "Lycophron",
  "Lycoris",
  "Lycurgos",
  "Lycus",
  "Lydus",
  "Lyell",
  "Lygdamis",
  "Lykomedes",
  "Lykon",
  "Lynceus",
  "Lyolf",
  "Lyon",
  "Lyonel",
  "Lyonell",
  "Lyonis",
  "Lysagoras",
  "Lysandros",
  "Lysanios",
  "Lysias",
  "Lysikles",
  "Lysimachos",
  "Lysippos",
  "Lysippus",
  "Lysis",
  "Lyulf",
  "Lyulph",
  "Macar",
  "Macarias",
  "Macedonius",
  "Machaon",
  "Madulnus",
  "Maelgut",
  "Maeon",
  "Magahard",
  "Maganhard",
  "Maginfred",
  "Maginrad",
  "Maginulf",
  "Magnentius",
  "Mago",
  "Maharbal",
  "Mahond",
  "Mahu",
  "Mahutia",
  "Maiandrios",
  "Maillart",
  "Maillet",
  "Mainard",
  "Mainardus",
  "Mainet",
  "Mainnet",
  "Maiorga",
  "Maiuel",
  "Maixent",
  "Majorian",
  "Maju",
  "Makarios",
  "Malabayn",
  "Malapallin",
  "Malbert",
  "Malcolinus",
  "Malcolum",
  "Malcude",
  "Malculinus",
  "Malculms",
  "Malculmus",
  "Malduit",
  "Maleos",
  "Males",
  "Malger",
  "Malise",
  "Mallobaudes",
  "Malo",
  "Malpramis",
  "Malprimis",
  "Malquiant",
  "Malun",
  "Mamme",
  "Mana",
  "Manard",
  "Manex",
  "Manfred",
  "Mangod",
  "Manifred",
  "Manoa",
  "Mansuetus",
  "Mantes",
  "Mantio",
  "Mantios",
  "Mantzio",
  "Manu",
  "Manzio",
  "Maore",
  "Mapen",
  "Maraulf",
  "Marc",
  "Marcel",
  "Marcian",
  "Marcion",
  "Marcomir",
  "Marcoul",
  "Marcule",
  "Marcus",
  "Marganice",
  "Margaris",
  "Maricho",
  "Maricus",
  "Marin",
  "Marius",
  "Marke",
  "Markel",
  "Marko",
  "Markus",
  "Marlo",
  "Marmaduc",
  "Marmaducus",
  "Marmedoke",
  "Marnes",
  "Maro",
  "Maron",
  "Marquardus",
  "Marque",
  "Marques",
  "Marsile",
  "Marsilion",
  "Marsyas",
  "Martel",
  "Martelet",
  "Marthanes",
  "Martin",
  "Martinet",
  "Martinianus",
  "Martino",
  "Martinus",
  "Martlet",
  "Martxel",
  "Martxelin",
  "Martxot",
  "Martyn",
  "Martyrius",
  "Maruthus",
  "Marz",
  "Maso",
  "Masso",
  "Mastor",
  "Matai",
  "Matei",
  "Matfrid",
  "Mathos",
  "Matia",
  "Matraien",
  "Mattin",
  "Matto",
  "Matullus",
  "Matxin",
  "Maucolyn",
  "Mauger",
  "Maugis",
  "Maukolum",
  "Maule",
  "Maulore",
  "Maurentius",
  "Maurianus",
  "Mauricius",
  "Maurie",
  "Maurin",
  "Maurinus",
  "Mauris",
  "Maurus",
  "Maury",
  "Maus",
  "Mausolos",
  "Maxentius",
  "Maximianus",
  "Maximin",
  "Maximinus",
  "Maynard",
  "Mazo",
  "Mazuste",
  "Mazzi",
  "Mecistes",
  "Mecistios",
  "Médard",
  "Meder",
  "Mederi",
  "Medios",
  "Medon",
  "Medus",
  "Meffridus",
  "Megadates",
  "Megakles",
  "Megakreon",
  "Megapenthes",
  "Megareus",
  "Megas",
  "Megasthenes",
  "Megathenes",
  "Meges",
  "Meginhard",
  "Megistias",
  "Megistus",
  "Mehme",
  "Meidias",
  "Meiel",
  "Meimert",
  "Meine",
  "Meinfridus",
  "Meingotus",
  "Melampos",
  "Melampus",
  "Melanippos",
  "Melanthios",
  "Melanthos",
  "Melas",
  "Melchert",
  "Meleagros",
  "Melegros",
  "Meles",
  "Meletius",
  "Meliboeus",
  "Melicertes",
  "Mello",
  "Melmer",
  "Melmidoc",
  "Melminius",
  "Meme",
  "Memnon",
  "Menalcas",
  "Menandros",
  "Menares",
  "Menas",
  "Mendebal",
  "Mendiko",
  "Menekrates",
  "Menelaos",
  "Menestas",
  "Menesthes",
  "Menesthios",
  "Menexinos",
  "Mengotus",
  "Menke",
  "Menne",
  "Mennte",
  "Menoeces",
  "Menoitios",
  "Mentes",
  "Mentor",
  "Merbal",
  "Mercadier",
  "Mercurius",
  "Merick",
  "Meriet",
  "Merigot",
  "Meriones",
  "Mermadak",
  "Mermerus",
  "Merobaudes",
  "Merops",
  "Merovech",
  "Mervin",
  "Mervyn",
  "Mesaulius",
  "Mesthles",
  "Metallo",
  "Methodios",
  "Methodius",
  "Metiochus",
  "Meto",
  "Meton",
  "Metrobius",
  "Metron",
  "Metrophanes",
  "Meuric",
  "Meurik",
  "Meurisse",
  "Meurius",
  "Meus",
  "Mezzi",
  "Michael",
  "Michaelius",
  "Michele",
  "Michell",
  "Micythos",
  "Midas",
  "Midylos",
  "Miguel",
  "Mihali",
  "Mihi",
  "Mikel",
  "Mikelar",
  "Mikelats",
  "Mikeldi",
  "Mikkos",
  "Mikolas",
  "Mikon",
  "Milanion",
  "Mile",
  "Miles",
  "Milet",
  "Milian",
  "Milo",
  "Milon",
  "Milot",
  "Miltiades",
  "Mimke",
  "Min",
  "Minos",
  "Mintho",
  "Miquiel",
  "Mirande",
  "Misenus",
  "Mittainne",
  "Mitxaut",
  "Mitxel",
  "Mnasyllus",
  "Mnesiphilos",
  "Mnester",
  "Mnesus",
  "Modaharius",
  "Modares",
  "Moeris",
  "Mogel",
  "Moliones",
  "Molpagoras",
  "Monoecus",
  "Monomachus",
  "Montxo",
  "Mopsius",
  "Mopsus",
  "Mor",
  "Morcock",
  "Morel",
  "Mores",
  "Moricius",
  "Morin",
  "Moris",
  "Morise",
  "Moriset",
  "Morrice",
  "Morris",
  "Morry",
  "Morsimus",
  "Morys",
  "Moryse",
  "Moschion",
  "Moschus",
  "Mourice",
  "Muato",
  "Mulius",
  "Munderic",
  "Mundo",
  "Mundus",
  "Munifrid",
  "Munio",
  "Munizo",
  "Musaeus",
  "Musaios",
  "Musko",
  "Musonius",
  "Muttines",
  "Mutu",
  "Mydon",
  "Mygdon",
  "Myles",
  "Myrsinus",
  "Myrto",
  "Mys",
  "Nab",
  "Nabar",
  "Nadilo",
  "Nagal",
  "Nahia",
  "Naimes",
  "Naimon",
  "Namatius",
  "Namus",
  "Nanno",
  "Narkissos",
  "Nastes",
  "Naubolus",
  "Naukles",
  "Naulabates",
  "Nausithous",
  "Nauteus",
  "Nazares",
  "Neal",
  "Neale",
  "Néapolion",
  "Nearchos",
  "Ned",
  "Neddie",
  "Neel",
  "Neil",
  "Nel",
  "Nele",
  "Neleos",
  "Nell",
  "Nelpus",
  "Neokles",
  "Neoptolemos",
  "Neozzo",
  "Nepotian",
  "Neritos",
  "Nestor",
  "Névelet",
  "Ngakaukawa",
  "Ngati",
  "Niarchos",
  "Nibelungus",
  "Nicaise",
  "Nicandros",
  "Nicanor",
  "Nicephorus",
  "Nicetas",
  "Nicetius",
  "Nicholas",
  "Nicholaus",
  "Nichomachus",
  "Nicias",
  "Nicodromos",
  "Nicolao",
  "Nicolaus",
  "Nicomachos",
  "Nicon",
  "Nidada",
  "Nidungus",
  "Niel",
  "Nigelle",
  "Nigellus",
  "Nigs",
  "Nihe",
  "Nikandros",
  "Nikanor",
  "Nikasios",
  "Nikeratos",
  "Niketas",
  "Nikias",
  "Nikola",
  "Nikomachos",
  "Nikomedes",
  "Nilus",
  "Nino",
  "Nireus",
  "Nisos",
  "Nithard",
  "Niuzilo",
  "Nivelet",
  "Nob",
  "Noeë",
  "Noël",
  "Noemon",
  "Noll",
  "Nolly",
  "Nomion",
  "Nonnosus",
  "Nonnus",
  "Norbert",
  "Nordbert",
  "Nordemann",
  "Note",
  "Nothon",
  "Notker",
  "Nott",
  "Numa",
  "Nuno",
  "Nute",
  "Nutkin",
  "Nutt",
  "Nuxila",
  "Nyctinus",
  "Nygell",
  "Nymphicus",
  "Nymphodorus",
  "Obeko",
  "Obert",
  "Ocealus",
  "Ochesius",
  "Ochos",
  "Ocke",
  "Ocytos",
  "Odaenathus",
  "Odard",
  "Odde",
  "Oddo",
  "Ode",
  "Odger",
  "Odibrand",
  "Odinel",
  "Odius",
  "Odo",
  "Odoin",
  "Odol",
  "Odon",
  "Odotheus",
  "Odouart",
  "Odovacar",
  "Odulf",
  "Odysseus",
  "Oeagnus",
  "Oecleus",
  "Oedipus",
  "Oenemaus",
  "Oeneus",
  "Oenomaus",
  "Oenopion",
  "Oenops",
  "Oenus",
  "Oger",
  "Ogerius",
  "Oggery",
  "Oggod",
  "Ogier",
  "Oicles",
  "Oidor",
  "Oier",
  "Oihan",
  "Oihenarte",
  "Oileas",
  "Oinatz",
  "Oinaz",
  "Olentzaro",
  "Oliatos",
  "Oliva",
  "Olivere",
  "Oliverus",
  "Olivier",
  "Olli",
  "Ollier",
  "Olly",
  "Olo",
  "Oltmann",
  "Olus",
  "Olver",
  "Olybrius",
  "Olympicus",
  "Olympio",
  "Olympiodorus",
  "Olympius",
  "Omer",
  "Omerus",
  "Omont",
  "Onamakritos",
  "Onbera",
  "Ondart",
  "Onesilos",
  "Onesimos",
  "Onesiphorus",
  "Onetas",
  "Onetor",
  "Onfroi",
  "Ongile",
  "Onias",
  "Onke",
  "Onne",
  "Onno",
  "Onntje",
  "Onomastos",
  "Onuphrius",
  "Ophelestes",
  "Opilano",
  "Opilio",
  "Opites",
  "Ops",
  "Orable",
  "Orain",
  "Orcus",
  "Orderic",
  "Orell",
  "Orestes",
  "Oresus",
  "Orges",
  "Oriabel",
  "Oriabiaus",
  "Oribasius",
  "Origen",
  "Orion",
  "Orius",
  "Orixe",
  "Orkatz",
  "Orland",
  "Oroites",
  "Oroitz",
  "Orpheus",
  "Orrick",
  "Orsilochus",
  "Orsiphantes",
  "Orthaeus",
  "Orti",
  "Ortle",
  "Ortolfus",
  "Ortwinus",
  "Ortzi",
  "Orythroneus",
  "Orzaize",
  "Osasun",
  "Osbarn",
  "Osbern",
  "Osbernus",
  "Osbertus",
  "Oscar",
  "Oseberne",
  "Osebertus",
  "Osewold",
  "Osgar",
  "Osgarus",
  "Oskarbi",
  "Oskell",
  "Osketel",
  "Oskitz",
  "Osman",
  "Osment",
  "Osmon",
  "Osmond",
  "Osmont",
  "Osmundus",
  "Osoitz",
  "Ospetsu",
  "Ospin",
  "Ostadar",
  "Ostargi",
  "Ostots",
  "Ostrogotha",
  "Osuin",
  "Osuuald",
  "Osuualdus",
  "Osuuol",
  "Osuuold",
  "Osuuoldus",
  "Oswall",
  "Oswell",
  "Oswinus",
  "Oswold",
  "Oswyn",
  "Otebon",
  "Otelin",
  "Otes",
  "Othes",
  "Othi",
  "Otho",
  "Othon",
  "Othone",
  "Othuel",
  "Oti",
  "Otis",
  "Otker",
  "Otois",
  "Oton",
  "Otreus",
  "Otrynteus",
  "Otsando",
  "Otsoa",
  "Otsoko",
  "Ottie",
  "Ottig",
  "Otto",
  "Otuel",
  "Otus",
  "Oudart",
  "Oudet",
  "Oudin",
  "Oudinet",
  "Oudinnet",
  "Ouein",
  "Ouen",
  "Ouin",
  "Oure",
  "Ourri",
  "Ouus",
  "Ovida",
  "Owain",
  "Owayne",
  "Owen",
  "Oweyn",
  "Owin",
  "Owine",
  "Owini",
  "Owun",
  "Owyne",
  "Oxarra",
  "Oxel",
  "Ozwell",
  "Pablo",
  "Pacatian",
  "Pachymeres",
  "Paeëon",
  "Paen",
  "Pagane",
  "Paganel",
  "Paganus",
  "Pagen",
  "Pagomari",
  "Paikea",
  "Pain",
  "Paios",
  "Pair",
  "Palaechthon",
  "Palaemon",
  "Palamas",
  "Palladius",
  "Pallans",
  "Pallas",
  "Palmys",
  "Palque",
  "Pammon",
  "Pamphilus",
  "Panaetios",
  "Panaetius",
  "Panares",
  "Pancras",
  "Pancratius",
  "Pandaros",
  "Pandion",
  "Pandulf",
  "Panionos",
  "Panites",
  "Pankratios",
  "Pannet",
  "Panpili",
  "Pantagathus",
  "Pantares",
  "Panteleon",
  "Panthous",
  "Pantites",
  "Pantzeska",
  "Panuel",
  "Paopeus",
  "Paora",
  "Papias",
  "Papin",
  "Paraebates",
  "Parcin",
  "Pardus",
  "Paris",
  "Pariset",
  "Parmenides",
  "Parmenion",
  "Parsefal",
  "Parthenius",
  "Parthenopaeus",
  "Parzifal",
  "Paschalis",
  "Pasion",
  "Paskal",
  "Pastor",
  "Pataicos",
  "Pate",
  "Paterick",
  "Paternus",
  "Patey",
  "Paton",
  "Patrice",
  "Patricius",
  "Patriz",
  "Patrobas",
  "Patrobus",
  "Patroclus",
  "Patron",
  "Patrycke",
  "Patsy",
  "Pattin",
  "Pattrik",
  "Patxi Frantxizko",
  "Patza",
  "Paulaui",
  "Paulin",
  "Paulo",
  "Paulus",
  "Pausanius",
  "Payn",
  "Payne",
  "Paynel",
  "Pedaeus",
  "Pedasus",
  "Pedocles",
  "Pegarius",
  "Peirithous",
  "Peiros",
  "Peisandros",
  "Peithon",
  "Pelagius",
  "Pelagon",
  "Pelegon",
  "Peleus",
  "Peli",
  "Pelias",
  "Pelicles",
  "Pello",
  "Pelonus",
  "Pelopidas",
  "Peneleos",
  "Peneus",
  "Pentheus",
  "Penthylos",
  "Peolpidas",
  "Pepin",
  "Perceval",
  "Percevale",
  "Percheval",
  "Percival",
  "Percivale",
  "Perctarit",
  "Percyvallus",
  "Percyvell",
  "Perdikkas",
  "Perdix",
  "Peregrine",
  "Peregrinus",
  "Periandros",
  "Periclymenus",
  "Perieeres",
  "Perigenes",
  "Perikles",
  "Perimedes",
  "Perimos",
  "Periphas",
  "Periphetes",
  "Periscus",
  "Peritas",
  "Periumus",
  "Perrando",
  "Persefall",
  "Persivell",
  "Peru",
  "Peruanton",
  "Perutxo",
  "Pes",
  "Peteos",
  "Petri",
  "Petrigai",
  "Petronas",
  "Petruche",
  "Petrus",
  "Peukestes",
  "Phaedo",
  "Phaenippos",
  "Phaeops",
  "Phaestus",
  "Phaidon",
  "Phaidriades",
  "Phalanthus",
  "Phalces",
  "Phalinos",
  "Phanagoras",
  "Phancis",
  "Phanes",
  "Phanias",
  "Phantias",
  "Phareman",
  "Pharnaces",
  "Phausius",
  "Phegeus",
  "Pheidias",
  "Pheidippides",
  "Pheidon",
  "Phelipe",
  "Phelipot",
  "Phelippe",
  "Phelippot",
  "Pheliset",
  "Phelyp",
  "Phelypp",
  "Phemius",
  "Phereclus",
  "Pherecydes",
  "Pheres",
  "Pheronactus",
  "Phidias",
  "Phigaleios",
  "Phil",
  "Philagrius",
  "Philagros",
  "Philaon",
  "Philaretus",
  "Philbert",
  "Philcox",
  "Phileas",
  "Philemon",
  "Philetor",
  "Philibert",
  "Philiot",
  "Philip",
  "Philipon",
  "Philipot",
  "Philippe",
  "Philippicus",
  "Philippot",
  "Philippus",
  "Philiskos",
  "Philistos",
  "Philkin",
  "Phillipos",
  "Phillippus",
  "Phillipus",
  "Philocion",
  "Philocrates",
  "Philoctetes",
  "Philocypros",
  "Philoetius",
  "Philogus",
  "Philokles",
  "Philokrates",
  "Philolaos",
  "Philologus",
  "Philomen",
  "Philomenes",
  "Philometer",
  "Philon",
  "Philonikos",
  "Philopoemon",
  "Philostratos",
  "Philostratus",
  "Philotas",
  "Philotectes",
  "Philoxenos",
  "Philoxenus",
  "Philpoemon",
  "Philpot",
  "Phineus",
  "Phintias",
  "Phipp",
  "Phitelet",
  "Phlaris",
  "Phlegon",
  "Phlios",
  "Phoebammon",
  "Phoenix",
  "Phoibus",
  "Phoinix",
  "Phoitios",
  "Phokas",
  "Phokion",
  "Phorbas",
  "Phorcys",
  "Phormion",
  "Phormos",
  "Photinus",
  "Photius",
  "Phrixus",
  "Phrynichos",
  "Phrynikos",
  "Phrynon",
  "Phylacus",
  "Phylas",
  "Phylypp",
  "Phytheon",
  "Phythian",
  "Pi",
  "Piarres",
  "Piccolet",
  "Picot",
  "Pidytes",
  "Pierre",
  "Pierres",
  "Pigres",
  "Piligrim",
  "Pinabel",
  "Pinder",
  "Pip",
  "Pippin",
  "Piri",
  "Pirithoos",
  "Pirmin",
  "Pisistratos",
  "Pistias",
  "Pitama",
  "Pittacos",
  "Pittacus",
  "Pittheus",
  "Pixodarus",
  "Pizzo",
  "Plades",
  "Platiau",
  "Pleistarchos",
  "Pleistos",
  "Plutarch",
  "Plutinus",
  "Podaeleirus",
  "Podaleirus",
  "Podalinus",
  "Podarces",
  "Podargos",
  "Podaroes",
  "Podes",
  "Poeas",
  "Poecas",
  "Poimen",
  "Poince",
  "Poincet",
  "Polemion",
  "Polentzi",
  "Poliadas",
  "Pollio",
  "Polyas",
  "Polybius",
  "Polyctor",
  "Polydectes",
  "Polydeuces",
  "Polydius",
  "Polydoros",
  "Polyeides",
  "Polygonus",
  "Polykleitos",
  "Polykles",
  "Polykritos",
  "Polymedes",
  "Polyneices",
  "Polypemon",
  "Polyperchon",
  "Polyphemous",
  "Polyphetes",
  "Polyphontes",
  "Polypoetes",
  "Polyxeinus",
  "Ponce",
  "Poncet",
  "Ponche",
  "Ponteus",
  "Popin",
  "Popiniau",
  "Poppa",
  "Poppe",
  "Poppens",
  "Poppo",
  "Porchier",
  "Porphyrios",
  "Porphyrius",
  "Poseidon",
  "Posides",
  "Posidonios",
  "Potamius",
  "Potamon",
  "Potkin",
  "Poufille",
  "Poz",
  "Prades",
  "Praesentinus",
  "Praetextatus",
  "Pratinos",
  "Praxilaus",
  "Praxis",
  "Praxiteles",
  "Praxites",
  "Presebal",
  "Prexinos",
  "Priam",
  "Priamon",
  "Pricion",
  "Principius",
  "Prinetadas",
  "Priscian",
  "Priskos",
  "Probus",
  "Procrustes",
  "Proctus",
  "Proetus",
  "Prokles",
  "Prokopios",
  "Prokrustes",
  "Proreus",
  "Protagoras",
  "Protesilaus",
  "Prothoenor",
  "Prothous",
  "Protogenes",
  "Protus",
  "Proxenos",
  "Prymneus",
  "Prytanis",
  "Ptolemaios",
  "Ptolomaeus",
  "Pudes",
  "Puhi",
  "Pupt",
  "Puvis",
  "Pylades",
  "Pylaemenes",
  "Pylaeus",
  "Pylartes",
  "Pylas",
  "Pylenor",
  "Pyris",
  "Pyrrhus",
  "Pythagoras",
  "Pytheas",
  "Pythes",
  "Pythios",
  "Pythogenes",
  "Quabin",
  "Quenall",
  "Quintin",
  "Quintinus",
  "Quito",
  "Raaf",
  "Rab",
  "Rabbie",
  "Rabel",
  "Radagaisus",
  "Radamanthos",
  "Radigis",
  "Radoald",
  "Radolf",
  "Radulf",
  "Radulfus",
  "Rafe",
  "Raff",
  "Raffo",
  "Rafold",
  "Raganald",
  "Raganfrid",
  "Raganhard",
  "Raganher",
  "Ragenald",
  "Raginhart",
  "Raginmund",
  "Raginpert",
  "Ragnfred",
  "Raguenel",
  "Raguet",
  "Rahere",
  "Rahier",
  "Raignald",
  "Raiimond",
  "Raimbaud",
  "Raimbaut",
  "Raimer",
  "Raimond",
  "Raimund",
  "Raimundus",
  "Rainald",
  "Rainaldus",
  "Rainard",
  "Rainerius",
  "Rainerus",
  "Rainier",
  "Raitin",
  "Ralf",
  "Rammius",
  "Rampo",
  "Ran",
  "Ranald",
  "Rand",
  "Randal",
  "Randall",
  "Randle",
  "Randolph",
  "Randoul",
  "Randulfus",
  "Randull",
  "Randy",
  "Rangi",
  "Rankin",
  "Rannulf",
  "Rannulfus",
  "Ranulf",
  "Ranulfus",
  "Ranulph",
  "Ranulphus",
  "Raolet",
  "Raolin",
  "Raollet",
  "Raollin",
  "Raoul",
  "Raoulet",
  "Raoulin",
  "Rasequin",
  "Ratchis",
  "Ratier",
  "Ratilo",
  "Rauf",
  "Rauffe",
  "Raulf",
  "Raullin",
  "Raulyn",
  "Rausimod",
  "Rautio",
  "Rauve",
  "Rawkin",
  "Rawlin",
  "Raymundus",
  "Raynaldus",
  "Rayner",
  "Raynerus",
  "Raynoldus",
  "Razo",
  "Recared",
  "Reccared",
  "Recceswinth",
  "Rechiar",
  "Rechimund",
  "Recitach",
  "Redway",
  "Reginald",
  "Reginalde",
  "Reginaldus",
  "Reginar",
  "Regino",
  "Régnier",
  "Reignald",
  "Reignolde",
  "Reimfred",
  "Reimond",
  "Reimund",
  "Reinald",
  "Reinboldus",
  "Reinfred",
  "Reinfrid",
  "Reinfridus",
  "Reinhold",
  "Reinold",
  "Reinoldus",
  "Reipert",
  "Rekitach",
  "Remert",
  "Remfrey",
  "Remi",
  "Remia",
  "Remier",
  "Remir",
  "Remismund",
  "Remmer",
  "Remon",
  "Remondin",
  "Remonnet",
  "Remont",
  "Rémy",
  "Renard",
  "Renart",
  "Renaud",
  "Renaudin",
  "Renaut",
  "Renfred",
  "Renfry",
  "Renier",
  "Renko",
  "Reno",
  "Renodet",
  "Renoldus",
  "Renonys",
  "Renost",
  "Renouart",
  "Renouf",
  "Renout",
  "Reolus",
  "Respa",
  "Resse",
  "Retemeris",
  "Reto",
  "Rewa",
  "Rex",
  "Reymnd",
  "Reynald",
  "Reynard",
  "Reynaud",
  "Reyner",
  "Reynfred",
  "Reynfrey",
  "Reynold",
  "Reynoldus",
  "Rhadamanthos",
  "Rhesus",
  "Rhexenor",
  "Rhima",
  "Ribald",
  "Ribes",
  "Ricard",
  "Ricardus",
  "Ricaud",
  "Rich",
  "Richal",
  "Richarde",
  "Richardin",
  "Richardus",
  "Richart",
  "Richemanus",
  "Richeut",
  "Richie",
  "Richier",
  "Richomer",
  "Richomeres",
  "Ricimer",
  "Rick",
  "Rickert",
  "Ricket",
  "Ricohard",
  "Ricon",
  "Rictiovarus",
  "Rikiar",
  "Ringerus",
  "Rionet",
  "Ripertus",
  "Rique",
  "Riquebourc",
  "Riquier",
  "Riso",
  "Rizon",
  "Rob",
  "Robard",
  "Robbie",
  "Rober",
  "Robertus",
  "Robin",
  "Robinet",
  "Robion",
  "Robyn",
  "Rocelinus",
  "Rodbertus",
  "Roderic",
  "Roderick",
  "Rodney",
  "Rodolf",
  "Rodolph",
  "Rodolphe",
  "Roduulf",
  "Rogatus",
  "Rogerin",
  "Rogerius",
  "Rogerus",
  "Roget",
  "Rogier",
  "Roguelin",
  "Roland",
  "Rolandus",
  "Rolant",
  "Roley",
  "Rolf",
  "Rolfe",
  "Rolft",
  "Rolland",
  "Rollant",
  "Rollin",
  "Rollo",
  "Rolph",
  "Romainne",
  "Romayne",
  "Romuald",
  "Ronald",
  "Roncin",
  "Rongo",
  "Roolf",
  "Roricus",
  "Roscelin Rocelin",
  "Rosser",
  "Rostand",
  "Rotari",
  "Rotbert",
  "Rotbertus",
  "Rotgerius",
  "Rothad",
  "Rothari",
  "Rotrou",
  "Roucaud",
  "Rouland",
  "Roulant",
  "Roule",
  "Roulf",
  "Roumain",
  "Roumiet",
  "Rowland",
  "Rowley",
  "Ruald Ruaud",
  "Rubertus",
  "Rudegerus",
  "Rudesind",
  "Rudolfus",
  "Rufier Rufin Rufus",
  "Ruisko",
  "Runo",
  "Russell Roussel",
  "Rusto",
  "Ruthardus",
  "Rychard",
  "Rycharde",
  "Saba",
  "Sabas",
  "Sabin",
  "Sabyllos",
  "Sadagares",
  "Sadun",
  "Saer",
  "Saerus",
  "Safrax",
  "Sagar",
  "Sagard",
  "Sagarus",
  "Saillot",
  "Sainte Santin",
  "Salbatore",
  "Salicar",
  "Salla",
  "Salmoneus",
  "Samer",
  "Samo",
  "Samson",
  "Sandaili",
  "Sander",
  "Sanders",
  "Sandre",
  "Sandrin",
  "Sanduru",
  "Sandy",
  "Sangiban",
  "Sanguin",
  "Sansalas",
  "Santi",
  "Santikurtz",
  "Santio",
  "Santutxo",
  "Santxo",
  "Santxol",
  "Saphrax",
  "Sarapammon",
  "Sarilo",
  "Sarpedon",
  "Sarus",
  "Sasoin",
  "Satabus",
  "Satordi",
  "Satyros",
  "Saunder",
  "Saundre",
  "Savaric Savary",
  "Sawney",
  "Sawnie",
  "Saxo",
  "Sayer",
  "Scaios",
  "Scamandius",
  "Scamandrius",
  "Schedius",
  "Scholasticus",
  "Sconea",
  "Scylax",
  "Scyllias",
  "Scythas",
  "Searl",
  "Searle",
  "Seaward",
  "Sebastianus",
  "Sebastos",
  "Seber",
  "Sede",
  "Segar",
  "Segarus",
  "Segeric",
  "Seguin",
  "Sehier Syhier",
  "Sein",
  "Seisames",
  "Selagus",
  "Selatse",
  "Seldomus",
  "Selenas",
  "Selepos",
  "Seleukos",
  "Selle",
  "Selles",
  "Seme",
  "Semeno",
  "Sendoa",
  "Senebaut",
  "Sengrat",
  "Senuthius",
  "Sequin",
  "Serell",
  "Sergius",
  "Seri",
  "Serill",
  "Serle",
  "Serlo",
  "Serlon",
  "Sernays",
  "Serrell",
  "Serrill",
  "Sesuldo",
  "Seuuard",
  "Seuuardus",
  "Seven",
  "Sevestre",
  "Sevrin",
  "Sewal",
  "Sewale",
  "Sewallus",
  "Seward",
  "Sewell",
  "Shapur",
  "Shilgen",
  "Shipitbaal",
  "Sibertus",
  "Sibico",
  "Sibilo",
  "Siboldus",
  "Sibragtus",
  "Sibratus",
  "Sicard Sicho Sicre",
  "Sicho",
  "Sicinnos",
  "Siculus",
  "Sidimund",
  "Siebrand",
  "Siefke",
  "Siegmyrth",
  "Sifridus",
  "Sigan",
  "Sigebert",
  "Sigenandus",
  "Sigeric",
  "Sigesar",
  "Sigibald",
  "Sigibert",
  "Sigibuld",
  "Sigismund",
  "Sigisvult",
  "Sikke",
  "Silanos",
  "Silban",
  "Silenos",
  "Silvestre",
  "Simmias",
  "Simo",
  "Simocatta",
  "Simoisius",
  "Simonides",
  "Sindel",
  "Sindila",
  "Sindo",
  "Sinibaldo",
  "Sinis",
  "Sinon",
  "Sippas",
  "Sirion",
  "Sirom",
  "Siromos",
  "Sisbert",
  "Sisebut",
  "Sisenand",
  "Sisyphus",
  "Sito",
  "Sittas",
  "Situli",
  "Sivis",
  "Siwardus",
  "Sjamme",
  "Skiron",
  "Smaragdus",
  "Smindyrides",
  "Smintheus",
  "Snaracho",
  "Snarung",
  "Snato",
  "Snazi",
  "Soas",
  "Socus",
  "Sohalet Soolet",
  "Sohier",
  "Soin",
  "Soke",
  "Sophanes",
  "Sophokles",
  "Soranus",
  "Sosibios",
  "Sosicles",
  "Sosigines",
  "Sosilus",
  "Sosimenes",
  "Sosipatros",
  "Sosthenes",
  "Sostias",
  "Sostratos",
  "Soter",
  "Sotil",
  "Souni Sonnet",
  "Speciosus",
  "Spertias",
  "Speudon",
  "Speusippos",
  "Spinther",
  "Spirodion",
  "Staas",
  "Stace",
  "Stacey",
  "Stachys",
  "Stacius",
  "Stacy",
  "Stallo",
  "Starchari",
  "Stauracius",
  "Steffen",
  "Stentor",
  "Stephane",
  "Stephen",
  "Stesagoras",
  "Stesanor",
  "Stesilaus",
  "Sthenelaus",
  "Sthenelus",
  "Stichius",
  "Stielf",
  "Stilicho",
  "Stolos",
  "Strabo",
  "Strachys",
  "Strategius",
  "Stratios",
  "Straton",
  "Strophantes",
  "Strophius",
  "Strymon",
  "Su",
  "Suatrius",
  "Sueridus",
  "Sugar",
  "Suger",
  "Sugoi",
  "Suidbert",
  "Suidger",
  "Sumar",
  "Sunericus",
  "Sunnia",
  "Sunno",
  "Suntje",
  "Suppo",
  "Sustrai",
  "Sweert",
  "Swikerus",
  "Swirt",
  "Swittert",
  "Syagricus",
  "Syagrius",
  "Syagros",
  "Syennesis",
  "Syloson",
  "Sylvester",
  "Symeon",
  "Symeonius",
  "Synesius",
  "Syriack",
  "Syward",
  "Sywardus",
  "Tadica",
  "Taiaho",
  "Taillefer",
  "Taillemache",
  "Taine",
  "Taino",
  "Taki",
  "Talaemenes",
  "Talaos",
  "Talaus",
  "Talbot",
  "Talebot",
  "Tallo",
  "Talon",
  "Talos",
  "Talthybios",
  "Tamás",
  "Tame",
  "Tamme",
  "Tanais",
  "Tanca",
  "Tancard",
  "Tancred",
  "Tancrede",
  "Tane",
  "Tankard",
  "Tarchaniotes",
  "Tarchon",
  "Tardu",
  "Tartalo",
  "Tassart Tassot Tassin",
  "Tassilo",
  "Tato",
  "Taua",
  "Taunui",
  "Taureas",
  "Taurin",
  "Tawno",
  "Te",
  "Tebaeus",
  "Tebald",
  "Tebaud",
  "Tebbe",
  "Tecton",
  "Tedbaldus",
  "Tedric",
  "Teebald",
  "Teias",
  "Teiresias",
  "Teja",
  "Te Kori",
  "Tekukuni",
  "Telamon",
  "Telekles",
  "Telemacho",
  "Telemachos",
  "Telemachus",
  "Telephos",
  "Telephus",
  "Telesinus",
  "Telesphorus",
  "Telines",
  "Tellias",
  "Tellis",
  "Tello",
  "Telys",
  "Tem",
  "Temenos",
  "Temuera",
  "Tendao",
  "Tenes",
  "Tenny",
  "Tenthredon",
  "Teodbald",
  "Teodric",
  "Tere",
  "Tereus",
  "Tericius",
  "Terillos",
  "Terrell",
  "Terric",
  "Terrick",
  "Terricus",
  "Terry",
  "Tescelin",
  "Tetbald",
  "Tetramnestus",
  "Tettrino",
  "Teucer",
  "Teukros",
  "Teutamos",
  "Teuthranes",
  "Teuthras",
  "Teutobod",
  "Tevenot",
  "Thales",
  "Thaleus",
  "Thalpius",
  "Thalysios",
  "Thancharat",
  "Thancheri",
  "Thancred",
  "Thankmar",
  "Tharuaro",
  "Tharybis",
  "Thaulos",
  "Thaumastus",
  "Theagenes",
  "Theages",
  "Theas",
  "Theasides",
  "Thebaldus",
  "Thee",
  "Thela",
  "Themistius",
  "Theobald",
  "Theobaldus",
  "Theocharistus",
  "Theoclymnius",
  "Theoctistus",
  "Theocydes",
  "Theodahad",
  "Théodard",
  "Theodbald",
  "Theodehad",
  "Theodekles",
  "Theodemar",
  "Theodemer",
  "Theoderic",
  "Theodericus",
  "Theoderid",
  "Theodilacus",
  "Theodo",
  "Theodoracius",
  "Theodore",
  "Theodoretus",
  "Theodoric",
  "Theodoricus",
  "Theodoros",
  "Theodorus",
  "Theodotus",
  "Theodric",
  "Theodulf",
  "Theodulph",
  "Theodulus",
  "Theogenius",
  "Theognis",
  "Theomestor",
  "Theomestros",
  "Theon",
  "Theopemptus",
  "Theophanes",
  "Theophilius",
  "Theophilus",
  "Theophrastos",
  "Theophrastus",
  "Theophylact",
  "Theophylactus",
  "Theophylaktos",
  "Theopompos",
  "Theopompus",
  "Theopropides",
  "Theoros",
  "Theos",
  "Theotimus",
  "Theotpert",
  "Theramenes",
  "Therapon",
  "Theras",
  "Thero",
  "Theron",
  "Thersandros",
  "Therseandros",
  "Thersilochus",
  "Thersites",
  "Thessalos",
  "Thestor",
  "Thettalos",
  "Theudebert",
  "Theudegisel",
  "Theudegisklos",
  "Theuderic",
  "Theudis",
  "Theudoald",
  "Theudobald",
  "Theutgaud",
  "Theutlich",
  "Thibaud",
  "Thidrek",
  "Thiébaut",
  "Thieme",
  "Thiemmo",
  "Thierri",
  "Thierry",
  "Thietmar",
  "Thilko",
  "Thim",
  "Thirkell",
  "Thiudimir",
  "Thiudorieks",
  "Thoas",
  "Thomas",
  "Thon",
  "Thonyn",
  "Thoön",
  "Thorald",
  "Thorax",
  "Thore",
  "Thorismud",
  "Thorismund",
  "Thorkill",
  "Thorold",
  "Thouche",
  "Thrasamund",
  "Thrasaric",
  "Thrasidaios",
  "Thrasilaus",
  "Thrasius",
  "Thrasybulos",
  "Thrasyllus",
  "Thrasymedes",
  "Thraustila",
  "Threspotus",
  "Thrustanus",
  "Thrystan",
  "Thukydides",
  "Thurstan",
  "Thurstanus",
  "Thurstin",
  "Thybaudin",
  "Thybaut",
  "Thyestes",
  "Thymoetes",
  "Thymotes",
  "Thyrsis",
  "Thyrsos",
  "Tiaki",
  "Tiakinga",
  "Tib",
  "Tibald",
  "Tibalt",
  "Tibaut",
  "Tibbald",
  "Tibbott",
  "Tibost",
  "Tibout",
  "Tiebaut",
  "Tiele",
  "Tierri",
  "Tiessot",
  "Tika",
  "Timagenidas",
  "Timagoras",
  "Timais",
  "Timanthes",
  "Timasion",
  "Timasitheus",
  "Timesithius",
  "Timm",
  "Timnes",
  "Timo",
  "Timoleon",
  "Timon",
  "Timonax",
  "Timote",
  "Timotheus",
  "Timoti",
  "Timoxenos",
  "Timozel",
  "Tinnelt",
  "Tipi",
  "Tiro",
  "Tirrell",
  "Tirynthius",
  "Tisamenos",
  "Tisandros",
  "Tisias",
  "Tithonius",
  "Titormos",
  "Tityrus",
  "Tjalf",
  "Tjark",
  "Tlepolemus",
  "Tmolus",
  "Toa",
  "Tobar",
  "Todor",
  "Tomás",
  "Tönjes",
  "Torleu",
  "Torphin",
  "Torquil",
  "Totakoxe",
  "Totila",
  "Trafstila",
  "Trapsta",
  "Trasaric",
  "Trasaricus",
  "Trasimondo",
  "Trechus",
  "Tribigild",
  "Tribonianus",
  "Tribunas",
  "Triopas",
  "Triptolemus",
  "Tristan",
  "Tristian",
  "Triston",
  "Tristram",
  "Triton",
  "Troezenus",
  "Trophimus",
  "Trophnus",
  "Tros",
  "Trostheri",
  "Trostila",
  "Truhtilo",
  "Trustan",
  "Trustram",
  "Trypho",
  "Trystrem",
  "Tuaivi",
  "Tufa",
  "Tuluin",
  "Turbertus",
  "Turgis",
  "Turold",
  "Turoldus",
  "Turpin",
  "Turquan",
  "Turrianus",
  "Turstan",
  "Turstanus",
  "Tursten",
  "Turstin",
  "Turstinus",
  "Tuste",
  "Tutain",
  "Tuu",
  "Tuyon",
  "Txanton",
  "Txaran",
  "Txartiko",
  "Txatxu",
  "Txerran",
  "Txeru",
  "Txilar",
  "Tximitx",
  "Txindoki",
  "Txomin",
  "Txordon",
  "Txurio",
  "Tybalt",
  "Tybaut",
  "Tybost",
  "Tybout",
  "Tychaeus",
  "Tydeides",
  "Tydeus",
  "Tymnes",
  "Tyndareus",
  "Tyndarios",
  "Tyon",
  "Tyrell",
  "Tzimisas",
  "Tzittas",
  "Ubarna",
  "Ubben",
  "Ubelteso",
  "Ubendu",
  "Ucalegon",
  "Ucco",
  "Uchered",
  "Ucke",
  "Uctred",
  "Udalaitz",
  "Udo",
  "Udona",
  "Uelert",
  "Ueli",
  "Ugaitz",
  "Ughtred",
  "Ugurtz",
  "Ugutz",
  "Uhin",
  "Uhredus",
  "Uhtred",
  "Uidt",
  "Ulert",
  "Ulfert",
  "Ulfilas",
  "Ulger",
  "Ulpt",
  "Ulricus",
  "Ulta",
  "Uluric",
  "Umea",
  "Umfray",
  "Umfrey",
  "Umfridus",
  "Umphrey",
  "Unai",
  "Unax",
  "Unigild",
  "Unila",
  "Unimund",
  "Uno",
  "Unsenis",
  "Untel",
  "Uptet",
  "Ur",
  "Uraias",
  "Uranius",
  "Urbasa",
  "Urbez",
  "Urbicus",
  "Urdaspal",
  "Urdin",
  "Urian",
  "Urianus",
  "Urien",
  "Urki",
  "Urko",
  "Urre",
  "Urritz",
  "Urs",
  "Urtats",
  "Urti",
  "Urtsin",
  "Urtsua",
  "Urtun",
  "Urtungo",
  "Urtzi",
  "Uryene",
  "Uwe",
  "Uwen",
  "Uzuri",
  "Vaanes",
  "Vacho",
  "Vagdvaraestus",
  "Valamer",
  "Valamir",
  "Valantinus",
  "Valaravans",
  "Valdebron",
  "Valentinus",
  "Valia",
  "Valter",
  "Vandalarius",
  "Vandil",
  "Vane",
  "Vannes",
  "Varazes",
  "Varin",
  "Varocher",
  "Vasacius",
  "Vasey",
  "Vauquelin",
  "Vedast",
  "Veduco",
  "Veitel",
  "Venantius",
  "Venerandus",
  "Venyse",
  "Vetericus",
  "Vetranio",
  "Vetranis",
  "Vettias",
  "Vézian",
  "Viator",
  "Vicelin",
  "Victor",
  "Victorinus",
  "Vidans",
  "Videric",
  "Vidigoia",
  "Vidimir",
  "Viel",
  "Viennet",
  "Vigilius",
  "Vigor",
  "Viliame",
  "Viliaris",
  "Vilihame",
  "Villiame",
  "Vince",
  "Vincenot",
  "Vincent",
  "Vincentius",
  "Vincey",
  "Vinitharius",
  "Virus",
  "Visimar",
  "Vital",
  "Vitalianus",
  "Vitalius",
  "Vitel",
  "Vithimiris",
  "Vithmiris",
  "Vitigis",
  "Vittamar",
  "Vitus",
  "Vivianus",
  "Vivien",
  "Volusian",
  "Vulmar",
  "Vultuulf",
  "Vvillequin",
  "Vyell",
  "Waco",
  "Waibilo",
  "Waido",
  "Waihoroi",
  "Waimar",
  "Waimiria",
  "Waiofar",
  "Waisale",
  "Wala",
  "Walahfrid",
  "Walahmar",
  "Walaric",
  "Walchelim",
  "Walchelin",
  "Walcher",
  "Waldef",
  "Waldeof",
  "Waldeve",
  "Waldew",
  "Waldhar",
  "Waldhere",
  "Waldibert",
  "Waldief",
  "Waldipert",
  "Waldive",
  "Waldolanus",
  "Waldomar",
  "Waleran Waleron",
  "Walganus",
  "Walhbert",
  "Waliko",
  "Walkelin",
  "Walkelinus",
  "Wallevus",
  "Wallia",
  "Wally",
  "Waloco",
  "Walpurga",
  "Walt",
  "Walterius",
  "Walterus",
  "Waltgaud",
  "Wamba",
  "Wandilo",
  "Wandregisel",
  "Wandregisilus",
  "Wandrille",
  "Warenheri",
  "Warin",
  "Wariner",
  "Warinhari",
  "Warinus",
  "Warmann",
  "Warnerius",
  "Warnerus",
  "Warren",
  "Warrenus",
  "Wasili",
  "Wat",
  "Water",
  "Watje",
  "Watkin",
  "Watkyn",
  "Watt",
  "Wattie",
  "Watty",
  "Wauter",
  "Wazo",
  "Wealdtheow",
  "Wecelo",
  "Weert",
  "Weffel",
  "Weidheri",
  "Weila",
  "Weinert",
  "Weintje",
  "Wella",
  "Welp",
  "Welpo",
  "Wene",
  "Wenert",
  "Wercha",
  "Wercrata",
  "Werdo",
  "Werinbert",
  "Werner",
  "Wernerus",
  "Wesh",
  "Wezilo",
  "Whatahui",
  "Wherehiko",
  "Wibert",
  "Wibil",
  "Wichard",
  "Wichmann",
  "Widargelt",
  "Widigast",
  "Wido",
  "Widogast",
  "Widradus",
  "Wiebrand",
  "Wiebt",
  "Wigandus",
  "Wigayn",
  "Wigo",
  "Wigstan",
  "Wihtred",
  "Wikerus",
  "Wilcke",
  "Wilcock",
  "Wilecoc",
  "Wilfred",
  "Wilhelm",
  "Wilhelmus",
  "Wiliam",
  "Wiliame",
  "Wilkie",
  "Wilkin",
  "Wilko",
  "Will",
  "Willahelm",
  "Willamar",
  "Willcock",
  "Willehad",
  "Willehelm",
  "Willelm",
  "Willelmus",
  "Willet",
  "William",
  "Williame",
  "Willibald",
  "Willibrord",
  "Willie",
  "Willmot",
  "Wilmot",
  "Wilred",
  "Wimarc",
  "Wimark",
  "Winebaud",
  "Winguric",
  "Winicho",
  "Wintar",
  "Wintherus",
  "Wintri",
  "Wirtje",
  "Wiscar",
  "Wiscard",
  "Wischard",
  "Wisgarus",
  "Wistan",
  "Wistanus",
  "Withari",
  "Withekindus",
  "Witige",
  "Wittigis",
  "Wittiza",
  "Wlfric",
  "Wlfriche",
  "Wlvricus",
  "Wobias",
  "Wocco",
  "Woco",
  "Wolkan",
  "Woltje",
  "Wortwinus",
  "Wracwulf",
  "Wulfram",
  "Wulfric",
  "Wultgar",
  "Wulurich",
  "Wunnihad",
  "Wurm",
  "Wy",
  "Wyat",
  "Wyliame",
  "Wylymot",
  "Wyman",
  "Wymar",
  "Wymarc",
  "Wymare",
  "Wymark",
  "Wymer",
  "Wymerus",
  "Wymon",
  "Wymond",
  "Wymund",
  "Wynkyn",
  "Wyon",
  "Wyschardus",
  "Wystan",
  "Ydevert",
  "Ymbert",
  "Yngerame",
  "Yon",
  "Ypolit",
  "Ypolitus",
  "Yric",
  "Ysembert",
  "Yuli",
  "Yvain",
  "Yve",
  "Yves",
  "Yvet",
  "Yvon",
  "Yvone",
  "Yvonnet",
  "Yvonus",
  "Ywain",
  "Xabat",
  "Xabier",
  "Xalbador",
  "Xantalen",
  "Xanthippos",
  "Xanthippus",
  "Xanthos",
  "Xanti",
  "Xarles",
  "Xavier",
  "Xefe",
  "Xenagoras",
  "Xenokrates",
  "Xenophanes",
  "Xenophon",
  "Ximun",
  "Xiphilinus",
  "Xofre",
  "Xuban",
  "Xurdin",
  "Xuthos",
  "Xuthus",
  "Zabal",
  "Zadornin",
  "Zagreus",
  "Zamolxis",
  "Zaracas",
  "Zarles",
  "Zebe",
  "Zeledon",
  "Zelimir",
  "Zemarchus",
  "Zenicetes",
  "Zeno",
  "Zenobius",
  "Zenodoros",
  "Zephyrinus",
  "Zernin",
  "Zeru",
  "Zeruko",
  "Zethus",
  "Zeuxidamos",
  "Zeuxis",
  "Zigor",
  "Zilar",
  "Zindel",
  "Zindelo",
  "Zinnridi",
  "Zinzo",
  "Ziper",
  "Zobe",
  "Zohiartze",
  "Zoil",
  "Zoilus",
  "Zoltan",
  "Zorion",
  "Zosimus",
  "Zuhaitz",
  "Zumar",
  "Zunbeltz",
  "Zuri",
  "Zuriko",
  "Zuzen",
  "Zwentibold"
];

// data/places.ts
var PLACES = [
  "Ufora",
  "Hogsfeet",
  "Tamworth",
  "Tywardreath",
  "Butterpond",
  "Padstow",
  "Bradfordshire",
  "Bexley",
  "Hillford",
  "Calcheth",
  "Murkwell",
  "Anghor Wat",
  "Monmouth",
  "Cherrytown",
  "Banrockburn",
  "Haling Cove",
  "Carningsby",
  "Penkurth",
  "Wanborne",
  "Favorsham",
  "Zalfari",
  "Coombe",
  "Scrabster",
  "Penketh",
  "Crossroads",
  "Auchendinny",
  "Macclesfield",
  "Porthcawl",
  "South Warren",
  "Daemarrel",
  "Tottenham",
  "Oldham",
  "Pathstow",
  "Aria",
  "Barnsley",
  "Boroughton",
  "Beggar's Hole",
  "Moonbright",
  "Bleakburn",
  "Hankala",
  "Auchendale",
  "Penzance",
  "Norton",
  "Sanlow",
  "Lunaris",
  "Dewsbury",
  "Narnclaedra",
  "Harthwaite",
  "Watford",
  "Tregaron",
  "Waeldestone",
  "Red Hawk",
  "Snowbush",
  "Ilragorn",
  "Newsham",
  "Tunstead",
  "Myrrka",
  "Bannockburn",
  "Crullfeld",
  "Helmfirth",
  "Langdale",
  "Ashborne",
  "Bailymena",
  "Stathmore",
  "Clacton",
  "Wavemeet",
  "Nishka",
  "Pella's Wish",
  "Holsworthy",
  "Larnwick",
  "Cardended",
  "Acrine",
  "Islesbury",
  "Sharnwick",
  "Durnatel",
  "Blackpool",
  "Hollyhead",
  "Ampleforth",
  "Wolford",
  "Faversham",
  "Axminster",
  "Larkinge",
  "Yarrin",
  "Skystead",
  "Nantgarth",
  "Zeffari",
  "Sudbury",
  "Westray",
  "Drumnacanvy",
  "Calmarnock",
  "Newham",
  "Grasmere",
  "Fanfoss",
  "Oar's Rest",
  "Beachcastle",
  "Bradford",
  "Fortaare",
  "Sheffield",
  "Lingmell",
  "Fool's March",
  "Pontybridge",
  "Kilmarnock",
  "Perthlochry",
  "Hirane",
  "Bullmar",
  "Colchester",
  "Kilerth",
  "Mensfield",
  "Fernsworth",
  "Crasmere",
  "Arkala",
  "Haerndean",
  "Glaenarm",
  "Wealdstone",
  "Wolfden",
  "Aroonshire",
  "Calchester",
  "Violl's Garden",
  "Moressley",
  "Poltragow",
  "Blencathra",
  "Caelfall",
  "Beckinsdale",
  "Willsden",
  "Caister",
  "Peterborough",
  "Marren's Eve",
  "Veritas",
  "Kinecardine",
  "Orilon",
  "Katinhanta",
  "Draycott",
  "Cullfield",
  "Longdale",
  "Fallholt",
  "Galssop",
  "Sutton",
  "Mestauskalio",
  "Glanchester",
  "Garthram",
  "Northon",
  "Peatsland",
  "Haran",
  "Cromer",
  "Firebend",
  "Nerton",
  "Llaneybyder",
  "Hampstead",
  "Grimsby",
  "Caerleon",
  "Bredon",
  "Farnworth",
  "Archmouth",
  "Lancaster",
  "Azmarin",
  "Hardersfield",
  "Wallowdale",
  "Lakeshore",
  "Solari",
  "Goldenleaf",
  "Pernrith",
  "Lerwick",
  "Seameet",
  "Rochdale",
  "Black Crystal",
  "Alcombey",
  "Huthwaite",
  "Arkaley",
  "Woodpine",
  "Ruthorham",
  "Pirn",
  "Perlshaw",
  "Bamburgh",
  "Astrakane",
  "Mansfield",
  "Coniston",
  "Black Hallows",
  "Jedburgh",
  "Tow",
  "Holden",
  "Waekefield",
  "Whiteridge",
  "Pitmerden",
  "Cumdivock",
  "Bournemouth",
  "Arcton",
  "Holbeck",
  "Cirrane",
  "Murtovaara",
  "Blencalgo",
  "Dornwich",
  "Halivaara",
  "Millstone",
  "Doncaster",
  "Acton",
  "Bromwich",
  "Kameeraska",
  "Gramsby",
  "Lhanbyrde",
  "Alderham",
  "Wealdlock",
  "Strathkeld",
  "Oldaton",
  "Mynyddburn",
  "Hogring",
  "Awkalea",
  "Fleshampton",
  "Lawsby",
  "Dripsnake",
  "Venaldame",
  "Vileshagg Lake",
  "Slavechute Hill",
  "Stinkbane",
  "Morttor",
  "Exebeck",
  "Woldmore",
  "Blazemount",
  "Denburgh",
  "Bitehovel Marsh",
  "Fatmede",
  "Killmancatt",
  "Langton",
  "Hawkoflea",
  "Devilach",
  "Monkfall",
  "Whelchester",
  "Leser Mynyddmere",
  "Painlea",
  "Fatleigh",
  "Monkbeat",
  "Marenden",
  "Holmside",
  "Aldermere Lake",
  "Spidersoflea",
  "Pontingham",
  "Foglowe",
  "Slavebugga",
  "Mount Dogoch",
  "Horefall Lake",
  "Leser Dinasmouth",
  "Redpool Fell",
  "Paintower",
  "Pitenden",
  "Horettin Mount",
  "Blackshen",
  "Llyndean",
  "Inverbryde Lake",
  "Treton",
  "Piratebugr Temple",
  "Worldsing",
  "Balingford",
  "Rendtease",
  "Stowtown",
  "Brigenhill Lodge",
  "Mormena",
  "Lyngburn",
  "Wesham",
  "Windleigh",
  "Illring",
  "Estorden",
  "Slaughterbunge",
  "Impsgrip",
  "Impsmede",
  "Breington",
  "Winterend",
  "Monkslot",
  "Belyslock",
  "Witchettin",
  "Holmster",
  "Spitmarshe",
  "Winterbridge",
  "Spothenge",
  "Angenford",
  "Hawkdroop",
  "Fisherscrutch",
  "Vilecastle",
  "Morworthy Castle",
  "Lanberry",
  "Bleddep",
  "Grimach",
  "Norlock",
  "Balasay",
  "Slimeington",
  "Itchyerscrutch Hills",
  "Hellsonas Lake",
  "Axeington",
  "Drumwardine",
  "Norsay",
  "Pucettin",
  "Moistely",
  "Somerchulish",
  "Norcheth",
  "Guiltyhalt",
  "Dorthwaite",
  "Shitester",
  "Lower Pipemount",
  "Norsby",
  "Shitettin",
  "Lickdame",
  "Knightance",
  "Worldsbeck",
  "Kineter",
  "Slutsmound",
  "Cunhole",
  "Lawwardine",
  "Skullslip Bridge",
  "Ashingford",
  "Killmanbugr",
  "Kilsey",
  "Lickoflea Bridge",
  "Helgame",
  "Filthtupp Farm",
  "Flopbunge",
  "Drunkoflea",
  "Whelsworth",
  "Moringham",
  "Huntingbran",
  "Mount Lhanetton",
  "Spidersgrip",
  "Smellhenge",
  "Fishwood",
  "Glamyscott",
  "Nankeld",
  "Dimmarshe",
  "Hawkerscrutch",
  "Exeingford",
  "Mordock",
  "Stickigrip",
  "Spidersbottom",
  "Morfeld",
  "Frozendame",
  "Dorham",
  "Astster",
  "Meatettin",
  "Boodysfolly",
  "Lickoflea Hill",
  "Morarder",
  "Houndskne Mountain",
  "Swinenden",
  "Culfield",
  "Pantingdene",
  "Trend",
  "Hurtdich Tor",
  "Drunkles",
  "East Huntingburn",
  "Someringdon",
  "Holmsey",
  "Knighttreath Mountain",
  "Strathbury Caves",
  "Puckdive",
  "Palmenden",
  "Belyscester",
  "Namysadale Moors",
  "Sadchute",
  "Llynsham",
  "Bourneshaw",
  "Morwich",
  "Port Balshen",
  "Evilbunge",
  "Blackenhill",
  "Lickonas",
  "Glamysworthy",
  "Puckander",
  "Deathtick",
  "Mortmede Bridge",
  "Killmantower Mount",
  "Aldstow",
  "Finham Hill",
  "Groklump",
  "Woldminster",
  "Minastow",
  "East Glamysanger",
  "Exelock",
  "Lower Sutmena",
  "Llynworthy",
  "Macden",
  "Illrise",
  "Ringgill",
  "Belysbeck",
  "Horebeat Down",
  "Dinasend Hill",
  "Drippinwind Mount",
  "Shepburgh",
  "Moistmarke Mountain",
  "Slavefall",
  "Fulstow",
  "Polminster",
  "Culbury",
  "Lickdive",
  "Blazedump",
  "Drumdale",
  "Hogkis",
  "Blazetick",
  "Angenden",
  "Billlowe",
  "Culington",
  "Axesham Down",
  "Itchyring",
  "Trenden Marsh",
  "Firerise",
  "Eldich",
  "Modesingham",
  "Brigtun",
  "Wormsgrip",
  "Venallea",
  "Worldston Lodge",
  "Blindbatte",
  "Venalslip",
  "Grentun",
  "Spitbugr",
  "Grokbreath Marsh",
  "Fireclapp",
  "Dalwich",
  "Monkcatt",
  "Dalster Moors",
  "Shafteadale",
  "Lickhalt",
  "Balashaw",
  "Asclapp Bridge",
  "Drunktor Lake",
  "Skullsllyn",
  "Dimllyn",
  "Axend",
  "Puckhalt",
  "Kilside",
  "Vilemound",
  "Belfos",
  "Stormely",
  "Taxylis Lake",
  "Guiltycrack",
  "Dengate Fell",
  "Bellock",
  "Namysaton",
  "Aslea",
  "Itchyaxe",
  "Holmshen",
  "Minasbran",
  "Auchtersey",
  "Inverdock",
  "Deathold Mount",
  "Askis Lodge",
  "Fulgill",
  "Fleshach",
  "Belmer",
  "Somerburgh",
  "Viledame",
  "Nastimarshe",
  "Estham",
  "Modesacombe Farm",
  "Lowampton Plains",
  "Lickhalt Plains",
  "Seaonas Farm",
  "Grotarmpit",
  "Wrongbent",
  "Illkne",
  "Belasington",
  "Olddean Hill",
  "Blackedene",
  "Hoppbumton Lake",
  "Minasfeld",
  "Fishbane",
  "Filthknock",
  "Langingdene",
  "Poisonknot",
  "Polbrough",
  "Nastidep Down",
  "Huntingthwaite",
  "Killock Mountain",
  "Witchdump Tor",
  "Sadles",
  "Poldean",
  "Enderlock",
  "Mortbane Barrow",
  "Gobblebane",
  "Hairdump",
  "Itchyonas Mount",
  "Gobbleslip",
  "Spotbugga",
  "Bledmarke Tor",
  "Filthrise",
  "Wealdstow",
  "Ponybottom",
  "Blindarmpit",
  "Mynyddchulish",
  "Firemes",
  "Gutkis",
  "Fishcave",
  "Brigbury",
  "Neatburgh",
  "Morchulish Castle",
  "Gobblesfolly Mountain",
  "South Macington",
  "Lyngster",
  "Mortbottom",
  "Panteter",
  "Gobbledame",
  "South Drippindump",
  "Leverbury Down",
  "Kilminstry",
  "Corley",
  "Mageshore",
  "Strongcourt",
  "Wildeburn",
  "Ashedge",
  "Rockshore",
  "Griffinmarsh",
  "Marshshore",
  "Springview",
  "Bushbridge",
  "Edgeham",
  "Falconmoor",
  "Westbarrow",
  "Greenby",
  "Lightash",
  "Springmeadow",
  "Freymead",
  "Highsnow",
  "Moorborough",
  "Iceland",
  "Violetfalcon",
  "Lightgrass",
  "Aelbank",
  "Dragonmill",
  "Newoak",
  "Vertmerrow",
  "Brookwyn",
  "Wellston",
  "Rockhollow",
  "Oldedge",
  "Strongston",
  "Vertness",
  "Clearmarsh",
  "Bysilver",
  "Bushmeadow",
  "Freylake",
  "Vertshade",
  "Shadowburn",
  "Mallowmead",
  "Eastmeadow",
  "Jangate",
  "Fallmont",
  "Highhurst",
  "Linfield",
  "Butterwind",
  "Beledge",
  "Summercoast",
  "Waterhedge",
  "Redmead",
  "Springhedge",
  "Wyvernston",
  "Elfbridge",
  "Bellmarsh",
  "Janwynne",
  "Northglass",
  "Wildecliff",
  "Byhill",
  "Wayfort",
  "Newwald",
  "Bellview",
  "Crystalbush",
  "Butterley",
  "Fallgate",
  "Lochston",
  "Valview",
  "Goldston",
  "Summernesse",
  "Southfield",
  "Janvale",
  "Greenmist",
  "Snowway",
  "Westgrass",
  "Westerhill",
  "Flowerbush",
  "Redwheat",
  "Olddell",
  "Glasshill",
  "Wildelyn",
  "Coldrock",
  "Lordale",
  "Westflower",
  "Deeplight",
  "Goldhollow",
  "Redfay",
  "Shadowcrest",
  "Swynland",
  "Mallowlyn",
  "Shadowshore",
  "Crystalwilde",
  "Mallowrose",
  "Eastspring",
  "Rosenesse",
  "Iceness",
  "Northbeach",
  "Dracwynne",
  "Merrimead",
  "Southhollow",
  "Esterway",
  "Bluemill",
  "Marbleport",
  "Elffield",
  "Meadowcoast"
];

// src/naming.ts
function randomName(rng, gender = "any") {
  if (gender === "female")
    return rng.pick(FEMALE_NAMES);
  if (gender === "male")
    return rng.pick(MALE_NAMES);
  return rng.pick(rng.chance(0.5) ? FEMALE_NAMES : MALE_NAMES);
}
function randomPlace(rng) {
  return rng.pick(PLACES);
}
var FACTION_STRUCTURES = [
  "The %ADJ% %NOUN%",
  "%NOUN% of the %SYMBOL%",
  "The %SYMBOL% %NOUN%",
  "%ADJ% %NOUN% of %PLACE%",
  "Order of the %SYMBOL%",
  "Brotherhood of the %SYMBOL%",
  "Sisterhood of the %SYMBOL%",
  "Guild of %PLURAL%",
  "The %SYMBOL% Compact",
  "House of the %SYMBOL%",
  "Sons of the %SYMBOL%",
  "Daughters of the %SYMBOL%",
  "Keepers of the %SYMBOL%",
  "The %SYMBOL% Hand",
  "The %ADJ% Covenant"
];
var FACTION_ADJECTIVES = [
  "Silent",
  "Hidden",
  "Crimson",
  "Golden",
  "Silver",
  "Iron",
  "Shadowed",
  "Burning",
  "Frozen",
  "Ancient",
  "Eternal",
  "Vigilant",
  "Faithful",
  "Merciful",
  "Vengeful",
  "Watchful",
  "Steadfast",
  "Wandering",
  "Blessed",
  "Forsaken",
  "Twilight",
  "Dawn",
  "Midnight",
  "Storm",
  "Thunder"
];
var FACTION_NOUNS = [
  "Brotherhood",
  "Sisterhood",
  "Order",
  "Guild",
  "Company",
  "Lodge",
  "Circle",
  "Council",
  "Covenant",
  "Fellowship",
  "League",
  "Society",
  "Cabal",
  "Congregation",
  "Assembly",
  "Conclave",
  "Syndicate",
  "Union"
];
var FACTION_SYMBOLS = [
  "Flame",
  "Star",
  "Moon",
  "Sun",
  "Serpent",
  "Wolf",
  "Raven",
  "Lion",
  "Rose",
  "Thorn",
  "Oak",
  "Iron",
  "Gold",
  "Silver",
  "Crown",
  "Sword",
  "Shield",
  "Coin",
  "Scale",
  "Compass",
  "Anchor",
  "Key",
  "Chalice",
  "Eye",
  "Hand",
  "Heart",
  "Skull",
  "Tower",
  "Gate",
  "Bridge",
  "Path",
  "Chain",
  "Ring",
  "Wheel",
  "Hammer",
  "Anvil",
  "Quill",
  "Scroll",
  "Ash",
  "Storm",
  "Bone",
  "Blood",
  "Shadow",
  "Frost",
  "Dawn",
  "Dusk",
  "Wyrm",
  "Phoenix",
  "Griffin",
  "Stag",
  "Bear",
  "Hawk",
  "Spider",
  "Viper"
];
var FACTION_PLURALS = [
  "Shadows",
  "Flames",
  "Whispers",
  "Secrets",
  "Blades",
  "Coins",
  "Stars",
  "Storms",
  "Thorns",
  "Ravens",
  "Wolves",
  "Lions"
];
function generateFactionName(rng, focus) {
  let structure;
  if (focus === "trade") {
    structure = rng.pick([
      "Guild of %PLURAL%",
      "The %SYMBOL% Compact",
      "%ADJ% %NOUN% of %PLACE%",
      "The %ADJ% %NOUN%"
    ]);
  } else if (focus === "martial") {
    structure = rng.pick([
      "Brotherhood of the %SYMBOL%",
      "Order of the %SYMBOL%",
      "The %SYMBOL% %NOUN%",
      "Sons of the %SYMBOL%",
      "The %ADJ% %NOUN%"
    ]);
  } else if (focus === "pious") {
    structure = rng.pick([
      "Order of the %SYMBOL%",
      "Keepers of the %SYMBOL%",
      "The %ADJ% Covenant",
      "Sisterhood of the %SYMBOL%",
      "House of the %SYMBOL%"
    ]);
  } else if (focus === "arcane") {
    structure = rng.pick([
      "The %ADJ% %NOUN%",
      "Keepers of the %SYMBOL%",
      "Order of the %SYMBOL%",
      "The %SYMBOL% Compact",
      "Circle of the %SYMBOL%"
    ]);
  } else {
    structure = rng.pick(FACTION_STRUCTURES);
  }
  return structure.replace("%ADJ%", rng.pick(FACTION_ADJECTIVES)).replace("%NOUN%", rng.pick(FACTION_NOUNS)).replace("%SYMBOL%", rng.pick(FACTION_SYMBOLS)).replace("%PLURAL%", rng.pick(FACTION_PLURALS)).replace("%PLACE%", randomPlace(rng));
}
var PARTY_STRUCTURES = [
  "%NAME%'s Company",
  "%NAME%'s Band",
  "The %ADJ% %PLURAL%",
  "%NAME%'s Wolves",
  "The %PLACE% %PLURAL%",
  "%NAME%'s Blades",
  "The %ADJ% Company",
  "%NAME% and Company",
  "The Wayward %PLURAL%",
  "%NAME%'s Oath"
];
var PARTY_ADJECTIVES = [
  "Bold",
  "Brave",
  "Free",
  "Wild",
  "Wandering",
  "Lucky",
  "Merry",
  "Grim",
  "Iron",
  "Steel",
  "Silver",
  "Golden",
  "Red",
  "Black",
  "White"
];
var PARTY_PLURALS = [
  "Companions",
  "Blades",
  "Swords",
  "Shields",
  "Brothers",
  "Sisters",
  "Wolves",
  "Hawks",
  "Ravens",
  "Lions",
  "Foxes",
  "Hounds",
  "Fists"
];
function generatePartyName(rng) {
  const structure = rng.pick(PARTY_STRUCTURES);
  return structure.replace("%NAME%", randomName(rng)).replace("%ADJ%", rng.pick(PARTY_ADJECTIVES)).replace("%PLURAL%", rng.pick(PARTY_PLURALS)).replace("%PLACE%", randomPlace(rng));
}
var CARAVAN_STRUCTURES = [
  "%PLACE% Traders",
  "The %ADJ% Caravan",
  "%NAME%'s Wagons",
  "%PLACE% Merchants",
  "The %SYMBOL% Trading Company",
  "%NAME% & Sons",
  "%PLACE% Provisioners",
  "The Wandering %PLURAL%"
];
var CARAVAN_ADJECTIVES = [
  "Northern",
  "Southern",
  "Eastern",
  "Western",
  "Far",
  "Old",
  "New",
  "Great",
  "Swift",
  "Honest",
  "Lucky",
  "Prosperous",
  "Wandering"
];
var CARAVAN_PLURALS = ["Merchants", "Traders", "Peddlers", "Provisioners"];
function generateCaravanName(rng) {
  const structure = rng.pick(CARAVAN_STRUCTURES);
  return structure.replace("%NAME%", randomName(rng)).replace("%ADJ%", rng.pick(CARAVAN_ADJECTIVES)).replace("%PLURAL%", rng.pick(CARAVAN_PLURALS)).replace("%SYMBOL%", rng.pick(FACTION_SYMBOLS)).replace("%PLACE%", randomPlace(rng));
}
var DUNGEON_STRUCTURES = [
  "The %ADJ% %PLACE_TYPE%",
  "%PLACE_TYPE% of %NOUN%",
  "The %NOUN% %PLACE_TYPE%",
  "%NAME%'s %PLACE_TYPE%",
  "%PLACE% %PLACE_TYPE%",
  "The %PLACE_TYPE% of %ADJ% %NOUN%",
  "%ADJ% %PLACE_TYPE% of %PLACE%"
];
var DUNGEON_PLACE_TYPES = [
  "Ruins",
  "Crypt",
  "Tomb",
  "Lair",
  "Caverns",
  "Depths",
  "Dungeon",
  "Fortress",
  "Tower",
  "Barrow",
  "Pit",
  "Maze",
  "Sanctum",
  "Vault",
  "Catacombs",
  "Warren",
  "Hold",
  "Keep",
  "Citadel",
  "Halls"
];
var DUNGEON_ADJECTIVES = [
  "Forgotten",
  "Ruined",
  "Sunken",
  "Haunted",
  "Cursed",
  "Burning",
  "Frozen",
  "Ancient",
  "Lost",
  "Hidden",
  "Forsaken",
  "Shadowed",
  "Blighted",
  "Flooded",
  "Crumbling",
  "Eternal",
  "Silent",
  "Screaming"
];
var DUNGEON_NOUNS = [
  "Shadows",
  "Bones",
  "Sorrow",
  "Madness",
  "Despair",
  "Whispers",
  "Echoes",
  "Chains",
  "Thorns",
  "Flame",
  "Ice",
  "Blood",
  "Death",
  "Secrets",
  "Doom",
  "Wrath",
  "Silence",
  "Darkness",
  "Dreams"
];
function generateDungeonName(rng) {
  const structure = rng.pick(DUNGEON_STRUCTURES);
  return structure.replace("%NAME%", randomName(rng)).replace("%ADJ%", rng.pick(DUNGEON_ADJECTIVES)).replace("%NOUN%", rng.pick(DUNGEON_NOUNS)).replace("%PLACE_TYPE%", rng.pick(DUNGEON_PLACE_TYPES)).replace("%PLACE%", randomPlace(rng));
}

// src/stocking.ts
var ROOM_TYPES = ["lair", "trap", "treasure", "empty", "shrine", "laboratory"];
function stockDungeon(rng, dungeon, rooms = 12) {
  const stocked = [];
  for (let i = 0;i < rooms; i += 1) {
    const type = rng.pick(ROOM_TYPES);
    const threat = Math.max(1, Math.min(5, dungeon.danger + rng.int(3) - 1));
    const loot = rng.chance(0.35);
    const rare = loot && rng.chance(0.1) ? rng.pick(["artifact", "relic", "ancient-map"]) : undefined;
    stocked.push({ type, threat, loot, rare });
  }
  return stocked;
}

// src/world.ts
function uniqueId(prefix, counter) {
  return `${prefix}-${counter}`;
}
var ARCHETYPES = ["Standard", "Age of War", "The Great Plague", "Arcane Bloom", "Wilderness Unbound", "Golden Age"];
var TERRAIN_WEIGHTS = [
  { terrain: "clear", weight: 4 },
  { terrain: "forest", weight: 3 },
  { terrain: "hills", weight: 3 },
  { terrain: "mountains", weight: 2 },
  { terrain: "swamp", weight: 2 },
  { terrain: "desert", weight: 1 }
];
function weightedTerrain(rng, weights) {
  const total = weights.reduce((acc, t) => acc + t.weight, 0);
  let roll = rng.int(total);
  for (const entry of weights) {
    roll -= entry.weight;
    if (roll < 0)
      return entry.terrain;
  }
  return "clear";
}
function getNeighbors(q, r, width, height) {
  const directions = [
    { q: 1, r: 0 },
    { q: -1, r: 0 },
    { q: 0, r: 1 },
    { q: 0, r: -1 },
    { q: 1, r: -1 },
    { q: -1, r: 1 }
  ];
  return directions.map((d) => ({ q: q + d.q, r: r + d.r })).filter((c) => c.q >= 0 && c.q < width && c.r >= 0 && c.r < height);
}
function terrainsCompatible(t1, t2) {
  const incompatible = {
    desert: ["swamp", "ocean", "river"],
    swamp: ["desert", "mountains"],
    mountains: ["swamp", "ocean"],
    ocean: ["mountains", "desert", "forest"]
  };
  return !(incompatible[t1]?.includes(t2) || incompatible[t2]?.includes(t1));
}
function generateHexMap(rng, width = 6, height = 6, weights) {
  const hexes = [];
  const hexMap = new Map;
  const oceanEdge = rng.int(4);
  const hasMountainSpine = rng.chance(0.6);
  const mountainSpinePos = hasMountainSpine ? 1 + rng.int(width - 2) : -1;
  const mountainSpineHorizontal = rng.chance(0.5);
  for (let q = 0;q < width; q += 1) {
    for (let r = 0;r < height; r += 1) {
      const key = `${q},${r}`;
      let terrain;
      const isOceanEdge = oceanEdge === 0 && q === 0 || oceanEdge === 1 && r === height - 1 || oceanEdge === 2 && q === width - 1 || oceanEdge === 3 && r === 0;
      const isCoastalEdge = oceanEdge === 0 && q === 1 || oceanEdge === 1 && r === height - 2 || oceanEdge === 2 && q === width - 2 || oceanEdge === 3 && r === 1;
      const onMountainSpine = hasMountainSpine && (mountainSpineHorizontal && r === mountainSpinePos || !mountainSpineHorizontal && q === mountainSpinePos);
      const distFromSpine = hasMountainSpine ? mountainSpineHorizontal ? Math.abs(r - mountainSpinePos) : Math.abs(q - mountainSpinePos) : 999;
      if (isOceanEdge) {
        terrain = "ocean";
      } else if (isCoastalEdge) {
        terrain = rng.chance(0.8) ? "coastal" : "clear";
      } else if (onMountainSpine) {
        terrain = rng.chance(0.7) ? "mountains" : "hills";
      } else if (distFromSpine === 1) {
        terrain = rng.chance(0.5) ? "hills" : weightedTerrain(rng, weights);
      } else {
        terrain = weightedTerrain(rng, weights);
      }
      const hex = { coord: { q, r }, terrain };
      hexes.push(hex);
      hexMap.set(key, hex);
    }
  }
  const clusteringPasses = 2;
  for (let pass = 0;pass < clusteringPasses; pass++) {
    for (const hex of hexes) {
      if (hex.terrain === "ocean" || hex.terrain === "coastal")
        continue;
      const neighbors = getNeighbors(hex.coord.q, hex.coord.r, width, height);
      const neighborTerrains = neighbors.map((c) => hexMap.get(`${c.q},${c.r}`)?.terrain).filter((t) => !!t && t !== "ocean");
      if (neighborTerrains.length === 0)
        continue;
      const counts = {};
      for (const t of neighborTerrains) {
        counts[t] = (counts[t] ?? 0) + 1;
      }
      let dominant = null;
      let maxCount = 0;
      for (const [t, count] of Object.entries(counts)) {
        if (count > maxCount && count >= 2) {
          maxCount = count;
          dominant = t;
        }
      }
      if (dominant && rng.chance(0.35) && terrainsCompatible(hex.terrain, dominant)) {
        if (dominant === "coastal") {
          const hasOceanNeighbor = neighborTerrains.includes("ocean");
          if (!hasOceanNeighbor)
            continue;
        }
        hex.terrain = dominant;
      }
    }
  }
  for (const hex of hexes) {
    if (hex.terrain === "ocean" || hex.terrain === "coastal")
      continue;
    const neighbors = getNeighbors(hex.coord.q, hex.coord.r, width, height);
    const neighborTerrains = neighbors.map((c) => hexMap.get(`${c.q},${c.r}`)?.terrain).filter((t) => !!t);
    for (const nt of neighborTerrains) {
      if (!terrainsCompatible(hex.terrain, nt)) {
        if (hex.terrain === "swamp" && nt === "mountains") {
          hex.terrain = "hills";
        } else if (hex.terrain === "desert" && nt === "swamp") {
          hex.terrain = "clear";
        } else if (hex.terrain === "swamp" && nt === "desert") {
          hex.terrain = "clear";
        } else if (hex.terrain === "mountains" && nt === "ocean") {
          hex.terrain = "hills";
        } else if (hex.terrain === "desert" && nt === "ocean") {
          hex.terrain = "coastal";
        } else if (hex.terrain === "forest" && nt === "ocean") {
          hex.terrain = "coastal";
        }
        break;
      }
    }
  }
  if (hasMountainSpine && rng.chance(0.5)) {
    const mountainHexes = hexes.filter((h) => h.terrain === "mountains");
    if (mountainHexes.length > 0) {
      const start = rng.pick(mountainHexes);
      let current = start.coord;
      const riverLength = 3 + rng.int(5);
      for (let i = 0;i < riverLength; i++) {
        const neighbors = getNeighbors(current.q, current.r, width, height);
        const toward = neighbors.find((c) => {
          if (oceanEdge === 0)
            return c.q < current.q;
          if (oceanEdge === 1)
            return c.r > current.r;
          if (oceanEdge === 2)
            return c.q > current.q;
          return c.r < current.r;
        });
        if (toward) {
          const targetHex = hexMap.get(`${toward.q},${toward.r}`);
          if (targetHex && targetHex.terrain !== "ocean" && targetHex.terrain !== "mountains") {
            if (rng.chance(0.5)) {
              targetHex.terrain = "river";
            }
            current = toward;
          } else {
            break;
          }
        } else {
          break;
        }
      }
    }
  }
  return hexes;
}
function isCoastalHex(world, coord) {
  const hex = world.hexes.find((h) => h.coord.q === coord.q && h.coord.r === coord.r);
  return hex?.terrain === "coastal";
}
function sampleDistinctHexes(rng, hexes, count) {
  const pool = [...hexes];
  const chosen = [];
  for (let i = 0;i < count && pool.length; i += 1) {
    const idx = rng.int(pool.length);
    chosen.push(pool[idx]);
    pool.splice(idx, 1);
  }
  return chosen;
}
function hexDistance(a, b) {
  return (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
}
function worstTerrain(t1, t2) {
  const rank = {
    road: 0,
    clear: 1,
    coastal: 1,
    river: 2,
    desert: 2,
    hills: 3,
    forest: 3,
    swamp: 4,
    mountains: 5,
    ocean: 6,
    reef: 6
  };
  return (rank[t1] ?? 3) >= (rank[t2] ?? 3) ? t1 : t2;
}
function createInitialWorld(rng, seed, start) {
  const archetype = rng.pick(ARCHETYPES);
  const width = 10;
  const height = 10;
  const terrainWeights = [...TERRAIN_WEIGHTS];
  if (archetype === "Wilderness Unbound") {
    terrainWeights.find((t) => t.terrain === "clear").weight = 1;
    terrainWeights.find((t) => t.terrain === "forest").weight = 6;
    terrainWeights.find((t) => t.terrain === "mountains").weight = 4;
  }
  const hexes = generateHexMap(rng, width, height, terrainWeights);
  const landHexes = hexes.filter((h) => h.terrain !== "ocean" && h.terrain !== "reef");
  const settlementCount = (archetype === "Golden Age" ? 7 : archetype === "Wilderness Unbound" ? 3 : 5) + rng.int(3);
  const settlementHexes = sampleDistinctHexes(rng, landHexes, settlementCount);
  const goods = ["grain", "timber", "ore", "textiles", "salt", "fish", "livestock"];
  const settlements = settlementHexes.map((hex, i) => {
    const supply = Object.fromEntries(goods.map((g) => [g, rng.int(5) - 2]));
    if (archetype === "Golden Age")
      supply.grain += 2;
    if (archetype === "The Great Plague")
      supply.livestock -= 2;
    const priceTrends = Object.fromEntries(goods.map((g) => [g, "normal"]));
    return {
      id: uniqueId("settlement", i),
      name: randomPlace(rng),
      population: (archetype === "Golden Age" ? 1000 : 200) + rng.int(1800),
      type: i === 0 ? "town" : rng.chance(0.3) ? "town" : "village",
      coord: hex.coord,
      supply,
      mood: archetype === "Golden Age" ? 2 : archetype === "Age of War" ? -2 : rng.int(5) - 2,
      priceTrends
    };
  });
  const roads = [];
  if (settlements.length > 1) {
    for (let i = 1;i < settlements.length; i += 1) {
      roads.push([settlements[0].id, settlements[i].id]);
    }
    if (settlements.length > 2) {
      const a = rng.pick(settlements);
      let b = rng.pick(settlements);
      if (b.id === a.id) {
        b = settlements[(settlements.indexOf(a) + 1) % settlements.length];
      }
      roads.push([a.id, b.id]);
    }
  }
  const parties = [
    {
      id: "party-0",
      name: generatePartyName(rng),
      members: [
        { name: randomName(rng), class: "Fighter", level: 1 + rng.int(3), hp: 20, maxHp: 20 },
        { name: randomName(rng), class: "Cleric", level: 1 + rng.int(3), hp: 15, maxHp: 15 },
        { name: randomName(rng), class: "Magic-User", level: 1 + rng.int(3), hp: 10, maxHp: 10 }
      ],
      location: settlements[0]?.name ?? settlements[settlements.length - 1]?.name ?? randomPlace(rng),
      status: "idle",
      xp: 0
    },
    {
      id: "band-0",
      name: generatePartyName(rng),
      members: [
        { name: randomName(rng), class: "Thief", level: 1 + rng.int(2), hp: 12, maxHp: 12 },
        { name: randomName(rng), class: "Elf", level: 1 + rng.int(2), hp: 14, maxHp: 14 }
      ],
      location: settlements[settlements.length - 1]?.name ?? settlements[0]?.name ?? randomPlace(rng),
      status: "idle",
      xp: 0
    }
  ];
  const factions = seedFactions(rng, archetype);
  return {
    seed,
    archetype,
    hexes,
    width,
    height,
    settlements,
    parties,
    roads,
    dungeons: seedDungeons(rng, settlements, archetype, width, hexes),
    activeRumors: [],
    npcs: seedNPCs(rng, settlements),
    factions,
    caravans: seedCaravans(rng, settlements, factions, roads),
    strongholds: [],
    armies: [],
    landmarks: [],
    ruins: [],
    nexuses: seedNexuses(rng, (archetype === "Arcane Bloom" ? 8 : 4) + rng.int(4), width),
    mercenaries: seedMercenaries(rng, settlements),
    startedAt: start
  };
}
function seedMercenaries(rng, settlements) {
  const companyNames = ["The Iron Brotherhood", "Silver Shields", "The Golden Lions", "Black Boars", "Red Ravagers", "The Free Company"];
  return companyNames.map((name, i) => {
    const settlement = rng.pick(settlements);
    return {
      id: `merc-${i}`,
      name,
      captainId: `npc-merc-captain-${i}`,
      location: settlement.name,
      size: 50 + rng.int(150),
      quality: 2 + rng.int(5),
      monthlyRate: 100 + rng.int(400),
      loyalty: 7 + rng.int(3)
    };
  });
}
function seedNexuses(rng, count, mapSize = 10) {
  const powerTypes = ["Arcane", "Divine", "Primal", "Shadow"];
  return Array.from({ length: count }, (_, i) => ({
    id: `nexus-${i}`,
    name: `${rng.pick(["Whispering", "Eternal", "Shattered", "Golden", "Deep"])} Nexus of ${rng.pick(["Stars", "Bones", "Life", "Void", "Time"])}`,
    location: { q: rng.int(mapSize), r: rng.int(mapSize) },
    powerType: rng.pick(powerTypes),
    intensity: 5 + rng.int(5)
  }));
}
function getSettlement(world, name) {
  return world.settlements.find((s) => s.name === name);
}
function getDungeon(world, name) {
  return world.dungeons.find((d) => d.name === name);
}
function getLocationCoord(world, name) {
  const settlement = getSettlement(world, name);
  if (settlement)
    return settlement.coord;
  const dungeon = getDungeon(world, name);
  if (dungeon)
    return dungeon.coord;
  return null;
}
function distanceMiles(world, fromName, toName) {
  const aCoord = getLocationCoord(world, fromName);
  const bCoord = getLocationCoord(world, toName);
  if (!aCoord || !bCoord)
    return null;
  const hexesApart = hexDistance(aCoord, bCoord);
  return Math.max(6, hexesApart * 6);
}
function pathTerrain(world, fromName, toName) {
  const aCoord = getLocationCoord(world, fromName);
  const bCoord = getLocationCoord(world, toName);
  if (!aCoord || !bCoord)
    return "clear";
  const a = getSettlement(world, fromName);
  const b = getSettlement(world, toName);
  if (a && b) {
    const hasRoad = world.roads.some(([fromId, toId]) => fromId === a.id && toId === b.id || fromId === b.id && toId === a.id);
    if (hasRoad)
      return "road";
  }
  return worstTerrain(hexesAt(world, aCoord)?.terrain ?? "clear", hexesAt(world, bCoord)?.terrain ?? "clear");
}
function hexesAt(world, coord) {
  return world.hexes.find((h) => h.coord.q === coord.q && h.coord.r === coord.r);
}
function settlementById(world, id) {
  return world.settlements.find((s) => s.id === id);
}
function updateFactionWealth(world, factionId, delta) {
  const f = world.factions.find((x) => x.id === factionId);
  if (!f)
    return;
  f.wealth = Math.max(0, f.wealth + delta);
}
function updateFactionAttitude(world, factionId, targetSettlement, delta) {
  const f = world.factions.find((x) => x.id === factionId);
  if (!f)
    return;
  if (!f.attitude[targetSettlement])
    f.attitude[targetSettlement] = 0;
  f.attitude[targetSettlement] = Math.max(-3, Math.min(3, f.attitude[targetSettlement] + delta));
}
function seedDungeons(rng, settlements, archetype, mapSize = 10, hexes = []) {
  if (!settlements.length)
    return [];
  const invalidHexes = new Set(hexes.filter((h) => h.terrain === "ocean" || h.terrain === "reef").map((h) => `${h.coord.q},${h.coord.r}`));
  const dungeonCount = 2 + rng.int(2);
  const dungeons = [];
  const usedCoords = new Set;
  for (let i = 0;i < dungeonCount; i++) {
    const anchor = rng.pick(settlements);
    let coord;
    let attempts = 0;
    do {
      coord = {
        q: Math.max(0, Math.min(mapSize - 1, anchor.coord.q + (rng.int(5) - 2))),
        r: Math.max(0, Math.min(mapSize - 1, anchor.coord.r + (rng.int(5) - 2)))
      };
      attempts++;
    } while ((usedCoords.has(`${coord.q},${coord.r}`) || invalidHexes.has(`${coord.q},${coord.r}`)) && attempts < 20);
    usedCoords.add(`${coord.q},${coord.r}`);
    const dungeon = {
      id: `dungeon-${i}`,
      name: generateDungeonName(rng),
      coord,
      depth: (archetype === "Standard" ? 3 : 5) + rng.int(3),
      danger: (archetype === "Wilderness Unbound" ? 4 : 2) + rng.int(3)
    };
    dungeon.rooms = stockDungeon(rng, dungeon);
    dungeon.explored = 0;
    dungeons.push(dungeon);
  }
  return dungeons;
}
function seedNPCs(rng, settlements) {
  const roles = ["merchant", "guard", "scout", "priest", "bard", "laborer"];
  const npcs = [];
  const count = Math.max(12, settlements.length * 2) + rng.int(6);
  for (let i = 0;i < count; i += 1) {
    const home = rng.pick(settlements);
    npcs.push({
      id: `npc-${i}`,
      name: randomName(rng),
      role: rng.pick(roles),
      home: home.id,
      location: home.name,
      reputation: rng.int(7) - 3,
      fame: 0,
      alive: true
    });
  }
  return npcs;
}
function seedCaravans(rng, settlements, factions, roads) {
  if (settlements.length < 2 || roads.length === 0)
    return [];
  const caravans = [];
  const usedRoutes = new Set;
  const count = Math.min(roads.length, 3 + rng.int(3));
  for (let i = 0;i < count; i += 1) {
    const availableRoads = roads.filter(([a, b]) => !usedRoutes.has(`${a}-${b}`) && !usedRoutes.has(`${b}-${a}`));
    if (availableRoads.length === 0)
      break;
    const [fromId, toId] = rng.pick(availableRoads);
    usedRoutes.add(`${fromId}-${toId}`);
    const from = settlements.find((s) => s.id === fromId);
    const to = settlements.find((s) => s.id === toId);
    if (!from || !to)
      continue;
    const sponsorFaction = rng.chance(0.6) && factions.length > 0 ? rng.pick(factions) : undefined;
    caravans.push({
      id: `caravan-${i}`,
      name: generateCaravanName(rng),
      route: [fromId, toId],
      goods: rng.pick([["grain", "textiles"], ["ore", "timber"], ["salt", "fish"], ["livestock"]]),
      location: from.name,
      progressHours: 0,
      direction: "outbound",
      escorts: [],
      factionId: sponsorFaction?.id,
      merchantId: undefined
    });
  }
  return caravans;
}
function seedFactions(rng, archetype) {
  const focuses = ["trade", "martial", "pious", "arcane", "trade", "martial"];
  const count = 4 + rng.int(3);
  return Array.from({ length: count }, (_, i) => {
    let focus = focuses[i % focuses.length];
    if (archetype === "Age of War" && rng.chance(0.5))
      focus = "martial";
    if (archetype === "Arcane Bloom" && i === 0)
      focus = "arcane";
    return {
      id: `faction-${i}`,
      name: generateFactionName(rng, focus),
      attitude: {},
      wealth: (archetype === "Golden Age" ? 200 : 50) + rng.int(100),
      focus
    };
  });
}

// src/encounters.ts
var ENCOUNTER_ODDS_DAY = {
  road: 1 / 12,
  clear: 1 / 6,
  forest: 2 / 6,
  hills: 2 / 6,
  mountains: 3 / 6,
  swamp: 3 / 6,
  desert: 2 / 6,
  coastal: 1 / 6,
  ocean: 0,
  reef: 0,
  river: 1 / 8
};
var ENCOUNTER_ODDS_NIGHT = {
  road: 1 / 10,
  clear: 1 / 12,
  forest: 2 / 12,
  hills: 2 / 12,
  mountains: 3 / 12,
  swamp: 3 / 12,
  desert: 2 / 12,
  coastal: 1 / 8,
  ocean: 0,
  reef: 0,
  river: 1 / 10
};
var FOES_BY_TERRAIN = {
  road: ["bandits", "brigands", "patrolling guards", "merchants"],
  clear: ["bandits", "wolves", "goblins", "orc raiders"],
  forest: ["wolves", "goblins", "brigands", "giant spiders"],
  hills: ["orc raiders", "goblins", "brigands", "ogre"],
  mountains: ["orc raiders", "giant bats", "goblins", "ogre"],
  swamp: ["lizardfolk", "giant leeches", "goblins", "brigands"],
  desert: ["bandits", "giant scorpions", "orc raiders", "gnolls"],
  coastal: ["smugglers", "pirates", "giant crabs", "fishermen", "sahuagin"],
  ocean: ["sea serpent", "pirates", "merfolk"],
  reef: ["sharks", "merfolk", "giant octopus"],
  river: ["bandits", "fishermen", "nixies", "giant pike"]
};
function reaction(rng) {
  const roll = 2 + rng.int(6) + rng.int(6);
  if (roll >= 10)
    return "friendly";
  if (roll >= 7)
    return "cautious";
  return "hostile";
}
function resolveEncounter(rng, terrain, actors) {
  const foes = FOES_BY_TERRAIN[terrain] ?? FOES_BY_TERRAIN.clear;
  const foe = rng.pick(foes);
  const react = reaction(rng);
  if (react === "friendly") {
    return {
      summary: `${actors[0]} parley with ${foe}`,
      details: "Trade news and share a quick meal before parting ways."
    };
  }
  if (react === "cautious") {
    const avoided = rng.chance(0.5);
    if (avoided) {
      return {
        summary: `${actors[0]} spot ${foe} and avoid notice`,
        details: "They detour carefully, leaving only faint tracks.",
        delayMiles: rng.chance(0.5) ? 3 : 0,
        fatigueDelta: rng.chance(0.3) ? 1 : 0
      };
    }
    return {
      summary: `${actors[0]} shadowed by ${foe}`,
      details: "Tense standoff; both sides withdraw before blades are drawn.",
      delayMiles: rng.chance(0.5) ? 2 : 0,
      fatigueDelta: rng.chance(0.3) ? 1 : 0
    };
  }
  const won = rng.chance(0.65);
  if (won) {
    return {
      summary: `${actors[0]} clash with ${foe}`,
      details: "Brief skirmish; foes driven off with minor bruises.",
      fatigueDelta: rng.chance(0.2) ? 1 : 0,
      injured: rng.chance(0.15)
    };
  }
  const death = rng.chance(0.2);
  return {
    summary: `${actors[0]} ambushed by ${foe}`,
    details: death ? "Casualties suffered in the rout." : "Forced retreat; they fall back to regroup.",
    delayMiles: 6 + rng.int(6),
    fatigueDelta: 1 + rng.int(2),
    injured: !death && rng.chance(0.4),
    death
  };
}
function maybeEncounter(rng, terrain, worldTime, location, actors, seed) {
  const hour = worldTime.getUTCHours();
  const isDay = hour >= 6 && hour < 18;
  const odds = isDay ? ENCOUNTER_ODDS_DAY[terrain] ?? 0 : ENCOUNTER_ODDS_NIGHT[terrain] ?? 0;
  if (!rng.chance(odds))
    return;
  const result = resolveEncounter(rng, terrain, actors);
  return {
    category: "road",
    summary: result.summary,
    details: result.details,
    location,
    actors,
    worldTime,
    realTime: new Date,
    seed,
    delayMiles: result.delayMiles
  };
}

// src/rumors.ts
var THEMES = ["treasure", "missing", "omen", "threat", "plot", "mystery"];
var TONES = ["whispered", "urgent", "conflicting", "cryptic", "official", "boastful"];
var HOOKS = [
  "an old map fragment",
  "a wounded messenger",
  "a frantic merchant",
  "a border scout",
  "a drunken soldier",
  "a frightened child",
  "a wandering priest",
  "a caravan guard",
  "a bard fresh from the road"
];
function pickTarget(world, rng) {
  if (world.dungeons.length && rng.chance(0.4)) {
    return { target: rng.pick(world.dungeons).name, kind: "dungeon" };
  }
  if (rng.chance(0.3)) {
    return { target: rng.pick(world.settlements).name, kind: "caravan" };
  }
  if (rng.chance(0.2)) {
    return { target: randomPlace(rng), kind: "monster-sign" };
  }
  return { target: rng.pick(world.settlements).name, kind: "feud" };
}
function makeText(world, rng, origin, target) {
  const theme = rng.pick(THEMES);
  const tone = rng.pick(TONES);
  const hook = rng.pick(HOOKS);
  const person = randomName(rng);
  const dungeon = world.dungeons.find((d) => d.name === target);
  const detailPool = [
    `strange lights near ${target}`,
    `missing heirlooms traced toward ${target}`,
    `bandits offering odd coins`,
    `beasts refusing to cross the old road`,
    `a sealed door that hums at night`,
    `villagers hearing chanting at dusk`,
    `fresh graves disturbed`,
    `a caravan late by two days`,
    `guards buying lamp oil in bulk`
  ];
  if (dungeon) {
    detailPool.push(`whispers of depth ${dungeon.depth} halls`, `signs of danger tier ${dungeon.danger}`, `old map showing ${dungeon.depth} levels and barred doors`);
  }
  const detail = rng.pick(detailPool);
  return `${tone} ${theme}: ${hook} says ${person} heard of ${detail} (from ${origin}).`;
}
function spawnRumor(world, rng, origin) {
  const { target, kind } = pickTarget(world, rng);
  return {
    id: `rumor-${Date.now()}-${rng.int(1e6)}`,
    kind,
    text: makeText(world, rng, origin, target),
    target,
    origin,
    freshness: 5 + rng.int(4)
  };
}
function decayRumors(world) {
  world.activeRumors = world.activeRumors.map((r) => ({ ...r, freshness: r.freshness - 1 })).filter((r) => r.freshness > 0);
}
function createRumor(world, rng, origin, target, kind, text, freshness = 5 + rng.int(4)) {
  return {
    id: `rumor-${Date.now()}-${rng.int(1e6)}`,
    kind,
    text,
    target,
    origin,
    freshness
  };
}
function logRumor(rumor, worldTime, seed) {
  return {
    category: "town",
    summary: `Rumor in ${rumor.origin}`,
    details: rumor.text,
    location: rumor.origin,
    worldTime,
    realTime: new Date,
    seed
  };
}
var TREASURE_RUMOR_SOURCES = [
  "a loose-tongued innkeeper",
  "a boastful adventurer",
  "a merchant counting coins",
  "a wounded survivor",
  "a jealous rival",
  "a temple acolyte",
  "a fence with nervous eyes",
  "a bard embellishing tales",
  "a spy in the shadows",
  "a drunk celebrating too loudly"
];
var TREASURE_RUMOR_REACTIONS = [
  "Collectors take note.",
  "Thieves sharpen their knives.",
  "Rivals grow envious.",
  "Old enemies remember.",
  "Dragons stir in their lairs.",
  "Dark forces take interest.",
  "Noble houses dispatch agents.",
  "The greedy make plans.",
  "Fortune-seekers gather.",
  "The underworld whispers."
];
function createTreasureRumor(rng, world, type, itemName, location, discoveredBy, estimatedValue, itemId) {
  const source = rng.pick(TREASURE_RUMOR_SOURCES);
  const reaction2 = rng.pick(TREASURE_RUMOR_REACTIONS);
  let attractsTypes = [];
  let text;
  switch (type) {
    case "legendary-item":
      attractsTypes = ["thieves-guild", "rival-party", "collector", "dragon", "antagonist", "faction"];
      text = `whispered treasure: ${source} tells of ${discoveredBy} finding ${itemName ?? "a legendary artifact"}. ${reaction2}`;
      break;
    case "artifact":
      attractsTypes = ["antagonist", "faction", "dragon", "collector", "dark-cult"];
      text = `urgent treasure: ${source} speaks of ${discoveredBy} possessing ${itemName ?? "an artifact of immense power"}. ${reaction2}`;
      break;
    case "rare-item":
      attractsTypes = ["thieves-guild", "rival-party", "collector"];
      text = `boastful treasure: ${source} mentions ${discoveredBy} carrying ${itemName ?? "a rare magic item"}. ${reaction2}`;
      break;
    case "magic-weapon":
      attractsTypes = ["rival-party", "faction", "warlord"];
      text = `conflicting treasure: ${source} describes ${itemName ?? "a powerful enchanted weapon"} now wielded by ${discoveredBy}. ${reaction2}`;
      break;
    case "massive-hoard":
      attractsTypes = ["thieves-guild", "rival-party", "dragon", "faction", "bandit"];
      text = `urgent treasure: ${source} whispers of ${discoveredBy} discovering a hoard worth ${estimatedValue.toLocaleString()} gold. ${reaction2}`;
      break;
    case "ongoing-extraction":
      attractsTypes = ["thieves-guild", "rival-party", "bandit", "monster"];
      text = `cryptic treasure: ${source} notes ${discoveredBy} making repeated trips to ${location}, laden with gold each time. ${reaction2}`;
      break;
    case "unguarded-treasure":
      attractsTypes = ["rival-party", "monster", "bandit", "faction"];
      text = `whispered treasure: ${source} claims a fortune lies abandoned in ${location}, left behind by ${discoveredBy}. ${reaction2}`;
      break;
  }
  const settlements = world.settlements.filter((s) => s.name !== location);
  const origin = settlements.length > 0 ? rng.pick(settlements).name : location;
  const freshness = type === "legendary-item" || type === "artifact" ? 14 + rng.int(14) : type === "massive-hoard" ? 10 + rng.int(10) : 5 + rng.int(7);
  return {
    id: `treasure-rumor-${Date.now()}-${rng.int(1e6)}`,
    kind: "mystery",
    text,
    target: location,
    origin,
    freshness,
    treasureType: type,
    itemId,
    itemName,
    estimatedValue,
    discoveredBy,
    attractsTypes
  };
}
function spreadTreasureRumor(rng, world, baseRumor) {
  const rumors = [baseRumor];
  const spreadCount = baseRumor.treasureType === "legendary-item" || baseRumor.treasureType === "artifact" ? 2 + rng.int(3) : baseRumor.treasureType === "massive-hoard" ? 1 + rng.int(2) : rng.chance(0.5) ? 1 : 0;
  const otherSettlements = world.settlements.filter((s) => s.name !== baseRumor.origin);
  for (let i = 0;i < Math.min(spreadCount, otherSettlements.length); i++) {
    const settlement = otherSettlements[i];
    const variant = { ...baseRumor };
    variant.id = `treasure-rumor-${Date.now()}-${rng.int(1e6)}`;
    variant.origin = settlement.name;
    variant.freshness = baseRumor.freshness - 1 - rng.int(3);
    if (rng.chance(0.3)) {
      variant.estimatedValue = Math.floor((variant.estimatedValue ?? 0) * (1.2 + rng.next()));
      variant.text = variant.text.replace("whispered", "exaggerated");
    }
    if (variant.freshness > 0) {
      rumors.push(variant);
    }
  }
  return rumors;
}

// src/factions.ts
function factionRumorOnEvent(world, rng, town, factionId, text, worldTime) {
  const rumor = createRumor(world, rng, town, town, "feud", text);
  world.activeRumors.push(rumor);
  return logRumor(rumor, worldTime, world.seed);
}
function factionTownBeat(world, rng, town, worldTime) {
  const logs = [];
  for (const faction of world.factions) {
    if (!faction.lastNoted || rng.chance(0.2)) {
      const attitude = faction.attitude[town] ?? 0;
      const flavor = attitude >= 2 ? "offers protection for caravans" : attitude <= -2 ? "demands tariffs and patrols the roads heavily" : "watches the markets quietly";
      const rumor = createRumor(world, rng, town, town, "feud", `${faction.name} ${flavor}.`);
      world.activeRumors.push(rumor);
      logs.push(logRumor(rumor, worldTime, world.seed));
      faction.lastNoted = town;
    }
  }
  return logs;
}

// src/npc.ts
function getSettlementName(world, settlementId) {
  const settlement = world.settlements.find((s) => s.id === settlementId);
  return settlement?.name ?? settlementId;
}
function moveEscortsIntoTown(world, npcIds, townName) {
  const moved = [];
  for (const id of npcIds) {
    const npc = world.npcs.find((n) => n.id === id);
    if (npc && npc.alive !== false) {
      npc.location = townName;
      moved.push(npc);
    }
  }
  return moved;
}
function npcArrivalLogs(npcs, townName, worldTime, seed, world) {
  return npcs.map((npc) => ({
    category: "town",
    summary: `${npc.name} arrives in ${townName}`,
    details: `${npc.role} from ${getSettlementName(world, npc.home)}`,
    location: townName,
    worldTime,
    realTime: new Date,
    seed
  }));
}
function npcMarketBeat(npcs, townName, worldTime, seed) {
  return npcs.map((npc) => ({
    category: "town",
    summary: `${npc.name} seen in ${townName} markets`,
    details: `${npc.role} haggles and swaps news.`,
    location: townName,
    worldTime,
    realTime: new Date,
    seed
  }));
}

// src/town.ts
var GOODS = ["grain", "timber", "ore", "textiles", "salt", "fish", "livestock"];
function dayKey(d) {
  return d.toISOString().slice(0, 10);
}
function pulseSupply(settlementSupply, rng) {
  const g = rng.pick(GOODS);
  const delta = rng.chance(0.5) ? 1 : -1;
  settlementSupply[g] = Math.max(-3, Math.min(3, settlementSupply[g] + delta));
}
function applyCaravanTrade(world, settlementName, goods) {
  const s = world.settlements.find((x) => x.name === settlementName);
  if (!s)
    return;
  for (const g of goods) {
    s.supply[g] = Math.min(4, (s.supply[g] ?? 0) + 1);
  }
  updatePriceTrends(s);
}
function updatePriceTrends(s) {
  s.priceTrends ??= {};
  for (const g of GOODS) {
    const level = s.supply[g] ?? 0;
    s.priceTrends[g] = level >= 2 ? "low" : level <= -2 ? "high" : "normal";
  }
}
function supplySummary(supply) {
  const highs = GOODS.filter((g) => supply[g] >= 2);
  const lows = GOODS.filter((g) => supply[g] <= -2);
  if (highs.length && lows.length) {
    return `Surplus ${highs.join("/")} and shortages in ${lows.join("/")}.`;
  }
  if (highs.length)
    return `Surplus ${highs.join("/")}.`;
  if (lows.length)
    return `Shortages in ${lows.join("/")}.`;
  return "Markets steady.";
}
function rumorFromSupply(rng, s) {
  const lows = GOODS.filter((g) => s.supply[g] <= -2);
  const highs = GOODS.filter((g) => s.supply[g] >= 2);
  if (lows.length && rng.chance(0.5)) {
    const g = rng.pick(lows);
    return `Levies rumored to secure ${g}; officials say caravans delayed.`;
  }
  if (highs.length && rng.chance(0.3)) {
    const g = rng.pick(highs);
    return `Bargain prices on ${g}; traders racing to ${s.name}.`;
  }
  return null;
}
function maybeRumor(world, rng, origin, logs, worldTime) {
  if (rng.chance(0.35)) {
    const rumor = spawnRumor(world, rng, origin);
    world.activeRumors.push(rumor);
    logs.push({
      category: "town",
      summary: `Rumor in ${origin}`,
      details: rumor.text,
      location: origin,
      worldTime,
      realTime: new Date,
      seed: world.seed
    });
  }
}
function dailyTownTick(world, rng, worldTime) {
  const logs = [];
  decayRumors(world);
  for (const s of world.settlements) {
    const day = dayKey(worldTime);
    if (s.lastTownLogDay === day && rng.chance(0.5) === false)
      continue;
    pulseSupply(s.supply, rng);
    s.mood = Math.max(-3, Math.min(3, s.mood + (rng.chance(0.3) ? 1 : -1)));
    updatePriceTrends(s);
    const supplyText = supplySummary(s.supply);
    const moodText = s.mood >= 2 ? "spirits high" : s.mood <= -2 ? "tempers frayed" : "folk watchful";
    const npcsHere = world.npcs.filter((n) => n.location === s.name && n.alive !== false);
    if (npcsHere.length && rng.chance(0.4)) {
      logs.push(...npcMarketBeat(npcsHere.slice(0, 2), s.name, worldTime, world.seed));
    }
    const partiesHere = world.parties.filter((p) => p.location === s.name && (p.fame ?? 0) >= 5);
    if (partiesHere.length && rng.chance(0.5)) {
      for (const p of partiesHere.slice(0, 1)) {
        logs.push({
          category: "town",
          summary: `${p.name} hailed in ${s.name}`,
          details: "Locals toast their exploits.",
          location: s.name,
          worldTime,
          realTime: new Date,
          seed: world.seed
        });
      }
    }
    logs.push({
      category: "town",
      summary: `${s.name} ${moodText}`,
      details: supplyText,
      location: s.name,
      worldTime,
      realTime: new Date,
      seed: world.seed
    });
    const econRumor = rumorFromSupply(rng, s);
    if (econRumor) {
      const rumor = createRumor(world, rng, s.name, s.name, "mystery", econRumor);
      world.activeRumors.push(rumor);
      logs.push(logRumor(rumor, worldTime, world.seed));
    } else {
      maybeRumor(world, rng, s.name, logs, worldTime);
    }
    logs.push(...factionTownBeat(world, rng, s.name, worldTime));
    s.lastTownLogDay = day;
  }
  return logs;
}
function chooseRumorGoal(world, rng, partyId) {
  if (!world.activeRumors.length)
    return null;
  const sorted = [...world.activeRumors].sort((a, b) => b.freshness - a.freshness);
  const choice = sorted[Math.min(sorted.length - 1, rng.int(sorted.length))];
  return choice;
}

// src/consequences.ts
var consequenceQueue = { pending: [] };
function getConsequenceQueue() {
  return consequenceQueue;
}
function setConsequenceQueue(queue) {
  consequenceQueue = queue;
}
function queueConsequence(consequence) {
  const id = `conseq-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  consequenceQueue.pending.push({ ...consequence, id });
}
function processConsequences(world, rng, worldTime) {
  const logs = [];
  const stillPending = [];
  for (const consequence of consequenceQueue.pending) {
    consequence.turnsUntilResolution -= 1;
    if (consequence.turnsUntilResolution <= 0) {
      const result = resolveConsequence(consequence, world, rng, worldTime);
      if (result)
        logs.push(...result);
    } else {
      stillPending.push(consequence);
    }
  }
  consequenceQueue.pending = stillPending;
  return logs;
}
function resolveConsequence(consequence, world, rng, worldTime) {
  const logs = [];
  switch (consequence.type) {
    case "spawn-rumor": {
      const { origin, target, kind, text } = consequence.data;
      const rumor = createRumor(world, rng, origin, target, kind, text);
      world.activeRumors.push(rumor);
      logs.push({
        category: "town",
        summary: `Word spreads in ${origin}`,
        details: rumor.text,
        location: origin,
        worldTime,
        realTime: new Date,
        seed: world.seed
      });
      break;
    }
    case "faction-action": {
      const { factionId, action, targetLocation } = consequence.data;
      const faction = world.factions.find((f) => f.id === factionId);
      if (!faction)
        break;
      const actionResults = resolveFactionAction(faction, action, targetLocation, world, rng, worldTime);
      logs.push(...actionResults);
      break;
    }
    case "npc-reaction": {
      const { npcId, reaction: reaction2, cause } = consequence.data;
      const npc = world.npcs.find((n) => n.id === npcId);
      if (!npc || npc.alive === false)
        break;
      const reactionLogs = resolveNPCReaction(npc, reaction2, cause, world, rng, worldTime);
      logs.push(...reactionLogs);
      break;
    }
    case "settlement-change": {
      const { settlementName, change, magnitude } = consequence.data;
      const settlement = world.settlements.find((s) => s.name === settlementName);
      if (!settlement)
        break;
      if (change === "mood-shift") {
        const oldMood = settlement.mood;
        settlement.mood = Math.max(-3, Math.min(3, settlement.mood + magnitude));
        if (settlement.mood !== oldMood) {
          const moodWord = magnitude > 0 ? "improves" : "darkens";
          logs.push({
            category: "town",
            summary: `Mood ${moodWord} in ${settlement.name}`,
            details: `Following recent events, the people's spirit ${moodWord === "improves" ? "lifts" : "sinks"}.`,
            location: settlement.name,
            worldTime,
            realTime: new Date,
            seed: world.seed
          });
        }
      }
      break;
    }
    case "spawn-antagonist": {
      const { location, threat, origin } = consequence.data;
      logs.push({
        category: "road",
        summary: `A new threat emerges near ${location}`,
        details: `${threat}. This is a consequence of ${origin}.`,
        location,
        worldTime,
        realTime: new Date,
        seed: world.seed
      });
      queueConsequence({
        type: "spawn-rumor",
        triggerEvent: `New threat: ${threat}`,
        turnsUntilResolution: 72 + rng.int(72),
        data: {
          origin: location,
          target: location,
          kind: "monster-sign",
          text: `Travelers speak of ${threat.toLowerCase()} on the roads near ${location}.`
        },
        priority: 3
      });
      break;
    }
    case "spawn-event": {
      const { category, summary, details, location, actors } = consequence.data;
      logs.push({
        category,
        summary,
        details,
        location,
        actors,
        worldTime,
        realTime: new Date,
        seed: world.seed
      });
      break;
    }
    case "supply-disruption": {
      const { armyId, duration } = consequence.data;
      const army = world.armies.find((a) => a.id === armyId);
      if (army) {
        army.supplies = Math.max(0, army.supplies - 30);
        logs.push({
          category: "faction",
          summary: `Sudden supply shortage for ${army.ownerId}'s forces`,
          details: `A critical supply caravan was lost or delayed. The army at ${army.location} is feeling the pinch.`,
          location: army.location,
          worldTime,
          realTime: new Date,
          seed: world.seed
        });
      }
      break;
    }
  }
  return logs;
}
function resolveFactionAction(faction, action, targetLocation, world, rng, worldTime) {
  const logs = [];
  switch (action) {
    case "patrol": {
      logs.push({
        category: "faction",
        summary: `${faction.name} increases patrols`,
        details: `Armed members of ${faction.name} now walk the roads${targetLocation ? ` near ${targetLocation}` : ""}.`,
        location: targetLocation,
        actors: [faction.name],
        worldTime,
        realTime: new Date,
        seed: world.seed
      });
      if (targetLocation) {
        const prevAttitude = faction.attitude[targetLocation] ?? 0;
        faction.attitude[targetLocation] = Math.min(3, prevAttitude + 1);
      }
      break;
    }
    case "retaliate": {
      const targetName = targetLocation ?? "their enemies";
      logs.push({
        category: "faction",
        summary: `${faction.name} seeks retribution`,
        details: `The ${faction.focus} faction marshals resources for action against ${targetName}.`,
        location: targetLocation,
        actors: [faction.name],
        worldTime,
        realTime: new Date,
        seed: world.seed
      });
      queueConsequence({
        type: "spawn-event",
        triggerEvent: `${faction.name} retaliation`,
        turnsUntilResolution: 288 + rng.int(144),
        data: {
          category: "faction",
          summary: `${faction.name} strikes back`,
          details: `Agents of ${faction.name} carry out their vengeance. The repercussions will be felt.`,
          location: targetLocation,
          actors: [faction.name]
        },
        priority: 4
      });
      break;
    }
    case "recruit": {
      const settlement = targetLocation ? world.settlements.find((s) => s.name === targetLocation) : rng.pick(world.settlements);
      if (!settlement)
        break;
      logs.push({
        category: "faction",
        summary: `${faction.name} recruiting in ${settlement.name}`,
        details: `Agents seek new members, promising coin and purpose.`,
        location: settlement.name,
        actors: [faction.name],
        worldTime,
        realTime: new Date,
        seed: world.seed
      });
      break;
    }
    case "trade-embargo": {
      if (!targetLocation)
        break;
      const settlement = world.settlements.find((s) => s.name === targetLocation);
      if (!settlement)
        break;
      faction.attitude[targetLocation] = Math.max(-3, (faction.attitude[targetLocation] ?? 0) - 2);
      logs.push({
        category: "faction",
        summary: `${faction.name} cuts ties with ${targetLocation}`,
        details: `Caravans flying the ${faction.name} banner no longer enter ${settlement.name}.`,
        location: targetLocation,
        actors: [faction.name],
        worldTime,
        realTime: new Date,
        seed: world.seed
      });
      queueConsequence({
        type: "settlement-change",
        triggerEvent: `Trade embargo by ${faction.name}`,
        turnsUntilResolution: 3,
        data: {
          settlementName: targetLocation,
          change: "mood-shift",
          magnitude: -1
        },
        priority: 2
      });
      break;
    }
  }
  return logs;
}
function resolveNPCReaction(npc, reaction2, cause, world, rng, worldTime) {
  const logs = [];
  switch (reaction2) {
    case "seek-revenge": {
      logs.push({
        category: "town",
        summary: `${npc.name} vows vengeance`,
        details: `Following ${cause}, the ${npc.role} swears an oath that cannot go unanswered.`,
        location: npc.location,
        actors: [npc.name],
        worldTime,
        realTime: new Date,
        seed: world.seed
      });
      queueConsequence({
        type: "spawn-event",
        triggerEvent: `${npc.name}'s revenge`,
        turnsUntilResolution: 24 + rng.int(48),
        data: {
          category: "town",
          summary: `${npc.name} makes their move`,
          details: `The vengeance long promised by the ${npc.role} comes to pass.`,
          location: npc.location,
          actors: [npc.name]
        },
        priority: 3
      });
      break;
    }
    case "flee": {
      const destinations = world.settlements.filter((s) => s.name !== npc.location);
      if (destinations.length === 0)
        break;
      const destination = rng.pick(destinations);
      logs.push({
        category: "road",
        summary: `${npc.name} flees ${npc.location}`,
        details: `Driven by ${cause}, they take to the road toward ${destination.name}.`,
        location: npc.location,
        actors: [npc.name],
        worldTime,
        realTime: new Date,
        seed: world.seed
      });
      queueConsequence({
        type: "spawn-event",
        triggerEvent: `${npc.name}'s flight`,
        turnsUntilResolution: 12 + rng.int(24),
        data: {
          category: "town",
          summary: `${npc.name} arrives in ${destination.name}`,
          details: `The refugee finds uncertain welcome in their new home.`,
          location: destination.name,
          actors: [npc.name]
        },
        priority: 2
      });
      npc.location = destination.name;
      break;
    }
    case "spread-rumors": {
      const targetLocation = npc.location;
      logs.push({
        category: "town",
        summary: `${npc.name} spreads tales`,
        details: `The ${npc.role} speaks openly of ${cause}. The story grows in the telling.`,
        location: targetLocation,
        actors: [npc.name],
        worldTime,
        realTime: new Date,
        seed: world.seed
      });
      queueConsequence({
        type: "spawn-rumor",
        triggerEvent: `${npc.name} gossip`,
        turnsUntilResolution: 1,
        data: {
          origin: targetLocation,
          target: targetLocation,
          kind: "mystery",
          text: `${npc.name} tells all who will listen: "${cause}." The tale spreads.`
        },
        priority: 2
      });
      break;
    }
    case "seek-protection": {
      const applicableFactions = world.factions.filter((f) => f.focus === "martial" || f.focus === "pious");
      if (applicableFactions.length === 0)
        break;
      const faction = rng.pick(applicableFactions);
      logs.push({
        category: "faction",
        summary: `${npc.name} seeks ${faction.name}'s protection`,
        details: `Frightened by ${cause}, the ${npc.role} appeals to the ${faction.focus} faction.`,
        location: npc.location,
        actors: [npc.name, faction.name],
        worldTime,
        realTime: new Date,
        seed: world.seed
      });
      if (rng.chance(0.5)) {
        queueConsequence({
          type: "faction-action",
          triggerEvent: `${npc.name}'s appeal`,
          turnsUntilResolution: 6 + rng.int(12),
          data: {
            factionId: faction.id,
            action: "patrol",
            targetLocation: npc.location
          },
          priority: 2
        });
      }
      break;
    }
  }
  return logs;
}
function analyzeEventForConsequences(event, world, rng) {
  const summary = event.summary.toLowerCase();
  const location = event.location ?? "";
  if (summary.includes("clash") || summary.includes("ambush") || summary.includes("battle") || summary.includes("falls") || summary.includes("driven back")) {
    const npcsInLocation = world.npcs.filter((n) => n.location === location && n.alive !== false);
    for (const npc of npcsInLocation) {
      if (rng.chance(0.2)) {
        const reactions = ["seek-revenge", "flee", "spread-rumors", "seek-protection"];
        queueConsequence({
          type: "npc-reaction",
          triggerEvent: event.summary,
          turnsUntilResolution: 6 + rng.int(30),
          data: {
            npcId: npc.id,
            reaction: rng.pick(reactions),
            cause: event.summary
          },
          priority: 2
        });
      }
    }
    for (const faction of world.factions) {
      if (rng.chance(0.15)) {
        queueConsequence({
          type: "faction-action",
          triggerEvent: event.summary,
          turnsUntilResolution: 72 + rng.int(72),
          data: {
            factionId: faction.id,
            action: rng.chance(0.5) ? "patrol" : "retaliate",
            targetLocation: location
          },
          priority: 3
        });
      }
    }
    if (location && world.settlements.some((s) => s.name === location)) {
      queueConsequence({
        type: "settlement-change",
        triggerEvent: event.summary,
        turnsUntilResolution: 2,
        data: {
          settlementName: location,
          change: "mood-shift",
          magnitude: -1
        },
        priority: 1
      });
    }
  }
  if (summary.includes("caravan") && (summary.includes("loss") || summary.includes("raid"))) {
    const relevantFaction = world.factions.find((f) => summary.includes(f.name.toLowerCase()));
    if (relevantFaction) {
      queueConsequence({
        type: "faction-action",
        triggerEvent: event.summary,
        turnsUntilResolution: 288 + rng.int(144),
        data: {
          factionId: relevantFaction.id,
          action: "retaliate",
          targetLocation: location
        },
        priority: 4
      });
      const armyNear = world.armies.find((a) => a.ownerId === relevantFaction.id && a.supplyLineFrom === location);
      if (armyNear) {
        queueConsequence({
          type: "supply-disruption",
          triggerEvent: event.summary,
          turnsUntilResolution: 6 + rng.int(12),
          data: { armyId: armyNear.id },
          priority: 5
        });
      }
    }
  }
  if (event.actors?.length && summary.includes("gain renown")) {
    const partyName = event.actors[0];
    queueConsequence({
      type: "spawn-rumor",
      triggerEvent: event.summary,
      turnsUntilResolution: 36 + rng.int(36),
      data: {
        origin: location,
        target: location,
        kind: "mystery",
        text: `Tales of ${partyName}'s deeds spread across the region. Some say they ${rng.pick(["slew a beast of legend", "recovered ancient treasures", "survived impossible odds", "earned the gratitude of the common folk"])}.`
      },
      priority: 2
    });
  }
  if (summary.includes("dungeon") || summary.includes("ruin")) {
    if (summary.includes("artifact") || summary.includes("relic") || summary.includes("treasure")) {
      queueConsequence({
        type: "spawn-antagonist",
        triggerEvent: event.summary,
        turnsUntilResolution: 24 + rng.int(48),
        data: {
          location,
          threat: "Rivals drawn by tales of treasure",
          origin: event.summary
        },
        priority: 3
      });
    }
  }
}

// src/treasure.ts
var COIN_WEIGHT = 0.1;
var GEM_WEIGHT = 1;
var JEWELRY_WEIGHT = 10;
var MAGIC_ITEM_WEIGHT = {
  potion: 5,
  scroll: 1,
  ring: 1,
  wand: 5,
  staff: 40,
  rod: 20,
  weapon: 50,
  armor: 100,
  misc: 20,
  artifact: 30
};
var CARRY_CAPACITY_PER_MEMBER = 500;
function getTripTime(dungeonRooms, terrain) {
  const baseHours = Math.max(1, Math.ceil(dungeonRooms / 4));
  const terrainMod = terrain === "swamp" ? 1.5 : terrain === "mountains" ? 1.3 : terrain === "forest" ? 1.1 : 1;
  return Math.ceil(baseHours * 2 * terrainMod);
}
function prioritizeLoad(extraction, magicItems, capacity) {
  const load = {
    coins: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
    gems: 0,
    jewelry: 0,
    magicItems: [],
    weight: 0
  };
  for (const itemId of extraction.remainingMagicItems) {
    const item = magicItems.find((m) => m.id === itemId);
    if (!item)
      continue;
    const itemWeight = MAGIC_ITEM_WEIGHT[item.category] ?? 20;
    if (load.weight + itemWeight <= capacity) {
      load.magicItems.push(itemId);
      load.weight += itemWeight;
    }
  }
  const ppCanTake = Math.min(extraction.remainingCoins.pp, Math.floor((capacity - load.weight) / COIN_WEIGHT));
  if (ppCanTake > 0) {
    load.coins.pp = ppCanTake;
    load.weight += ppCanTake * COIN_WEIGHT;
  }
  const gemsCanTake = Math.min(extraction.remainingGems, Math.floor((capacity - load.weight) / GEM_WEIGHT));
  if (gemsCanTake > 0) {
    load.gems = gemsCanTake;
    load.weight += gemsCanTake * GEM_WEIGHT;
  }
  const gpCanTake = Math.min(extraction.remainingCoins.gp, Math.floor((capacity - load.weight) / COIN_WEIGHT));
  if (gpCanTake > 0) {
    load.coins.gp = gpCanTake;
    load.weight += gpCanTake * COIN_WEIGHT;
  }
  const jewelryCanTake = Math.min(extraction.remainingJewelry, Math.floor((capacity - load.weight) / JEWELRY_WEIGHT));
  if (jewelryCanTake > 0) {
    load.jewelry = jewelryCanTake;
    load.weight += jewelryCanTake * JEWELRY_WEIGHT;
  }
  const epCanTake = Math.min(extraction.remainingCoins.ep, Math.floor((capacity - load.weight) / COIN_WEIGHT));
  if (epCanTake > 0) {
    load.coins.ep = epCanTake;
    load.weight += epCanTake * COIN_WEIGHT;
  }
  const spCanTake = Math.min(extraction.remainingCoins.sp, Math.floor((capacity - load.weight) / COIN_WEIGHT));
  if (spCanTake > 0) {
    load.coins.sp = spCanTake;
    load.weight += spCanTake * COIN_WEIGHT;
  }
  const cpCanTake = Math.min(extraction.remainingCoins.cp, Math.floor((capacity - load.weight) / COIN_WEIGHT));
  if (cpCanTake > 0) {
    load.coins.cp = cpCanTake;
    load.weight += cpCanTake * COIN_WEIGHT;
  }
  return load;
}
function createTreasureState() {
  return {
    discoveredHoards: [],
    circulatingMagicItems: [],
    recentInfluxes: [],
    activeExtractions: []
  };
}
function tickExtractions(rng, treasureState, world, worldTime) {
  const logs = [];
  for (const extraction of treasureState.activeExtractions) {
    if (extraction.completed || extraction.abandoned)
      continue;
    if (extraction.nextTripCompletes && new Date(extraction.nextTripCompletes) <= worldTime) {
      const party = world.parties.find((p) => p.name === extraction.extractingParty);
      if (rng.chance(0.1)) {
        const EXTRACTION_ENCOUNTERS = [
          "wandering monsters attack the laden party",
          "rival adventurers ambush them on the way out",
          "the dungeon denizens have reinforced",
          "a cave-in blocks the exit temporarily",
          "thieves were waiting outside"
        ];
        const encounter = rng.pick(EXTRACTION_ENCOUNTERS);
        if (rng.chance(0.3)) {
          const lostPercent = 0.1 + rng.next() * 0.3;
          logs.push({
            category: "dungeon",
            summary: `${extraction.extractingParty} ambushed during extraction!`,
            details: `${encounter.charAt(0).toUpperCase() + encounter.slice(1)}. Some treasure is lost in the chaos.`,
            location: extraction.location,
            actors: [extraction.extractingParty],
            worldTime,
            realTime: new Date,
            seed: world.seed
          });
          extraction.currentLoad.coins.gp = Math.floor(extraction.currentLoad.coins.gp * (1 - lostPercent));
          extraction.currentLoad.coins.pp = Math.floor(extraction.currentLoad.coins.pp * (1 - lostPercent));
          extraction.currentLoad.gems = Math.floor(extraction.currentLoad.gems * (1 - lostPercent));
          if (party && rng.chance(0.4)) {
            party.wounded = true;
            party.restHoursRemaining = Math.max(party.restHoursRemaining ?? 0, 12);
          }
        } else {
          logs.push({
            category: "dungeon",
            summary: `${extraction.extractingParty} fights off attackers during extraction`,
            details: `${encounter.charAt(0).toUpperCase() + encounter.slice(1)}, but the party prevails and continues.`,
            location: extraction.location,
            actors: [extraction.extractingParty],
            worldTime,
            realTime: new Date,
            seed: world.seed
          });
        }
      }
      extraction.tripsCompleted++;
      extraction.lastTripAt = worldTime;
      extraction.extractedWeight += extraction.currentLoad.weight;
      for (const coinType of Object.keys(extraction.currentLoad.coins)) {
        extraction.remainingCoins[coinType] -= extraction.currentLoad.coins[coinType];
      }
      extraction.remainingGems -= extraction.currentLoad.gems;
      extraction.remainingJewelry -= extraction.currentLoad.jewelry;
      for (const itemId of extraction.currentLoad.magicItems) {
        const item = treasureState.circulatingMagicItems.find((m) => m.id === itemId);
        if (item) {
          item.ownerId = extraction.extractingParty;
          item.location = party?.location ?? extraction.location;
        }
        extraction.remainingMagicItems = extraction.remainingMagicItems.filter((id) => id !== itemId);
      }
      if (extraction.tripsCompleted === 1 || extraction.tripsCompleted % 3 === 0) {
        const percentComplete = Math.round(extraction.extractedWeight / extraction.totalWeight * 100);
        logs.push({
          category: "dungeon",
          summary: `${extraction.extractingParty} completes extraction trip #${extraction.tripsCompleted}`,
          details: `${percentComplete}% of the hoard extracted. ${extraction.estimatedTripsRemaining - extraction.tripsCompleted} trips remaining.`,
          location: extraction.location,
          actors: [extraction.extractingParty],
          worldTime,
          realTime: new Date,
          seed: world.seed
        });
      }
      const remainingWeight = Object.values(extraction.remainingCoins).reduce((sum, c) => sum + c * COIN_WEIGHT, 0) + extraction.remainingGems * GEM_WEIGHT + extraction.remainingJewelry * JEWELRY_WEIGHT + extraction.remainingMagicItems.length * 20;
      if (remainingWeight <= 0 || extraction.remainingCoins.pp === 0 && extraction.remainingCoins.gp === 0 && extraction.remainingGems === 0 && extraction.remainingJewelry === 0 && extraction.remainingMagicItems.length === 0) {
        extraction.completed = true;
        const leftBehind = extraction.remainingCoins.cp + extraction.remainingCoins.sp + extraction.remainingCoins.ep;
        logs.push({
          category: "dungeon",
          summary: `${extraction.extractingParty} finishes extracting the hoard!`,
          details: leftBehind > 100 ? `After ${extraction.tripsCompleted} trips, the valuable items are secured. ${leftBehind.toLocaleString()} lesser coins were left behind.` : `After ${extraction.tripsCompleted} trips, the hoard is fully claimed.`,
          location: extraction.location,
          actors: [extraction.extractingParty],
          worldTime,
          realTime: new Date,
          seed: world.seed
        });
        const hoard = treasureState.discoveredHoards.find((h) => h.id === extraction.hoardId);
        if (hoard && hoard.totalValue >= 1000) {
          queueConsequence({
            type: "treasure-influx",
            triggerEvent: `${extraction.extractingParty} brings treasure to market`,
            turnsUntilResolution: 72 + rng.int(168),
            data: { amount: hoard.totalValue, hoardId: hoard.id, location: extraction.location, discoveredBy: extraction.extractingParty },
            priority: 3
          });
        }
      } else {
        const partySize = party?.members?.length ?? 4;
        const carryCapacity = partySize * CARRY_CAPACITY_PER_MEMBER;
        extraction.currentLoad = prioritizeLoad(extraction, treasureState.circulatingMagicItems, carryCapacity);
        extraction.estimatedTripsRemaining = Math.ceil(remainingWeight / carryCapacity);
        const dungeon = world.dungeons.find((d) => d.name === extraction.location);
        const tripHours = getTripTime(dungeon?.rooms?.length ?? 12, "hills");
        extraction.nextTripCompletes = new Date(worldTime.getTime() + tripHours * 60 * 60 * 1000);
        const remainingValue = extraction.remainingCoins.cp * 0.01 + extraction.remainingCoins.sp * 0.1 + extraction.remainingCoins.ep * 0.5;
        if (remainingValue < 50 && extraction.remainingGems === 0 && extraction.remainingMagicItems.length === 0) {
          if (rng.chance(0.5)) {
            extraction.abandoned = true;
            logs.push({
              category: "dungeon",
              summary: `${extraction.extractingParty} abandons remaining copper and silver`,
              details: `The remaining ${Math.floor(remainingValue)} gold worth of base coins isn't worth the danger. They move on.`,
              location: extraction.location,
              actors: [extraction.extractingParty],
              worldTime,
              realTime: new Date,
              seed: world.seed
            });
          }
        }
      }
    }
    if (!extraction.completed && !extraction.abandoned && extraction.tripsCompleted > 0) {
      if (extraction.tripsCompleted === 2 && rng.chance(0.4)) {
        const hoard = treasureState.discoveredHoards.find((h) => h.id === extraction.hoardId);
        const baseRumor = createTreasureRumor(rng, world, "ongoing-extraction", undefined, extraction.location, extraction.extractingParty, hoard?.totalValue ?? extraction.totalWeight * 10);
        const allRumors = spreadTreasureRumor(rng, world, baseRumor);
        for (const rumor of allRumors) {
          world.activeRumors.push(rumor);
          logs.push(logRumor(rumor, worldTime, world.seed));
        }
        logs.push({
          category: "faction",
          summary: `Word spreads of ${extraction.extractingParty}'s treasure haul`,
          details: `Thieves and rivals take note. The extraction may become more dangerous.`,
          location: extraction.location,
          worldTime,
          realTime: new Date,
          seed: world.seed
        });
        for (const attractType of baseRumor.attractsTypes) {
          if (rng.chance(0.25)) {
            queueConsequence({
              type: `treasure-${attractType}`,
              triggerEvent: `${attractType} learns of ${extraction.extractingParty}'s extraction`,
              turnsUntilResolution: 24 + rng.int(120),
              data: {
                extractionId: extraction.id,
                partyName: extraction.extractingParty,
                location: extraction.location,
                attractType
              },
              priority: attractType === "bandit" || attractType === "monster" ? 4 : 3
            });
          }
        }
      }
    }
  }
  const weekAgo = new Date(worldTime.getTime() - 7 * 24 * 60 * 60 * 1000);
  treasureState.activeExtractions = treasureState.activeExtractions.filter((e) => !e.completed && !e.abandoned || new Date(e.startedAt) > weekAgo);
  return logs;
}
function processTreasureInflux(rng, treasureState, world, worldTime) {
  const logs = [];
  for (const influx of treasureState.recentInfluxes) {
    const settlement = world.settlements.find((s) => s.id === influx.settlementId || s.name === influx.settlementId);
    if (!settlement)
      continue;
    const daysSinceInflux = (worldTime.getTime() - new Date(influx.arrivedAt).getTime()) / (24 * 60 * 60 * 1000);
    if (daysSinceInflux <= 7) {
      const inflationFactor = influx.amount / (settlement.population * 10);
      if (inflationFactor >= 0.5) {
        for (const good of Object.keys(settlement.priceTrends ?? {})) {
          if (!settlement.priceTrends)
            settlement.priceTrends = {};
          settlement.priceTrends[good] = "high";
        }
        if (daysSinceInflux === 1) {
          logs.push({
            category: "town",
            summary: `Prices rise in ${settlement.name}`,
            details: `A flood of gold from ${influx.source} drives up prices. Merchants smile; common folk grumble.`,
            location: settlement.name,
            worldTime,
            realTime: new Date,
            seed: world.seed
          });
        }
      }
    } else if (daysSinceInflux >= 60) {
      influx.amount = 0;
    }
  }
  treasureState.recentInfluxes = treasureState.recentInfluxes.filter((i) => i.amount > 0);
  for (const hoard of treasureState.discoveredHoards) {
    if (hoard.liquidated || hoard.percentSpent >= 100)
      continue;
    const daysSinceDiscovery = (worldTime.getTime() - new Date(hoard.discoveredAt).getTime()) / (24 * 60 * 60 * 1000);
    if (daysSinceDiscovery >= 1 && hoard.percentSpent < 100) {
      const spendRate = 100 / (14 + rng.int(14));
      hoard.percentSpent = Math.min(100, hoard.percentSpent + spendRate);
      if (hoard.percentSpent >= 100) {
        hoard.liquidated = true;
        hoard.liquidatedAt = worldTime;
        if (hoard.totalValue >= 5000) {
          logs.push({
            category: "town",
            summary: `${hoard.discoveredBy} finishes spending their fortune`,
            details: `The ${hoard.totalValue.toLocaleString()} gold hoard has been distributed throughout the region. The economy absorbs the wealth.`,
            location: hoard.location,
            actors: [hoard.discoveredBy],
            worldTime,
            realTime: new Date,
            seed: world.seed
          });
        }
      }
    }
  }
  return logs;
}
function tickMagicItems(rng, treasureState, world, worldTime) {
  const logs = [];
  for (const item of treasureState.circulatingMagicItems) {
    if (!item.identified && item.discoveredAt) {
      const daysSinceDiscovery = (worldTime.getTime() - new Date(item.discoveredAt).getTime()) / (24 * 60 * 60 * 1000);
      if (daysSinceDiscovery >= 1 && rng.chance(0.15)) {
        item.identified = true;
        item.identifiedAt = worldTime;
        if (item.rarity !== "common") {
          logs.push({
            category: "town",
            summary: `${item.name} identified`,
            details: item.cursed ? `A curse is revealed! The item is not what it seemed.` : `The item's true nature is discovered: ${item.properties.join(", ") || "a fine magical item"}.`,
            location: item.location,
            worldTime,
            realTime: new Date,
            seed: world.seed
          });
        }
      }
    }
  }
  return logs;
}
function tickTreasureRumorReactions(rng, treasureState, world, worldTime) {
  const logs = [];
  const treasureRumors = world.activeRumors.filter((r) => r.treasureType !== undefined);
  for (const rumor of treasureRumors) {
    if (!rng.chance(0.01))
      continue;
    const reactor = rng.pick(rumor.attractsTypes);
    switch (reactor) {
      case "thieves-guild":
        logs.push({
          category: "faction",
          summary: `The underworld takes interest in ${rumor.itemName ?? "the treasure"}`,
          details: `Thieves discuss the ${rumor.treasureType.replace("-", " ")} discovered by ${rumor.discoveredBy}. Plans are being made.`,
          location: rumor.origin,
          worldTime,
          realTime: new Date,
          seed: world.seed
        });
        queueConsequence({
          type: "guild-heist-target",
          triggerEvent: `Guild targets ${rumor.discoveredBy}'s treasure`,
          turnsUntilResolution: 168 + rng.int(336),
          data: { targetParty: rumor.discoveredBy, itemName: rumor.itemName, itemId: rumor.itemId },
          priority: 3
        });
        break;
      case "rival-party":
        const rivalName = `The ${rng.pick(["Iron", "Black", "Silver", "Red", "Golden"])} ${rng.pick(["Blades", "Company", "Brotherhood", "Hand", "Wolves"])}`;
        logs.push({
          category: "road",
          summary: `${rivalName} hear of ${rumor.discoveredBy}'s fortune`,
          details: `Jealousy and ambition stir. A rival party considers their options.`,
          location: rumor.origin,
          worldTime,
          realTime: new Date,
          seed: world.seed
        });
        queueConsequence({
          type: "rival-party-conflict",
          triggerEvent: `${rivalName} confronts ${rumor.discoveredBy}`,
          turnsUntilResolution: 48 + rng.int(168),
          data: { rivalName, targetParty: rumor.discoveredBy, reason: rumor.treasureType },
          priority: 4
        });
        break;
      case "collector":
        const collectorName = `Lord ${rng.pick(["Blackwood", "Silverton", "Goldmane", "Ravenholm", "Thornwood"])}`;
        const offerAmount = Math.floor((rumor.estimatedValue ?? 1000) * (1.2 + rng.next() * 0.8));
        logs.push({
          category: "town",
          summary: `${collectorName} seeks to acquire ${rumor.itemName ?? "the treasure"}`,
          details: `Word reaches ${rumor.discoveredBy} of a collector offering ${offerAmount.toLocaleString()} gold. A legitimate offer, or a trap?`,
          location: rumor.origin,
          actors: [collectorName, rumor.discoveredBy ?? "unknown"],
          worldTime,
          realTime: new Date,
          seed: world.seed
        });
        break;
      case "dragon":
        if (rumor.treasureType === "legendary-item" || rumor.treasureType === "massive-hoard") {
          logs.push({
            category: "road",
            summary: `A dragon stirs at rumors of treasure`,
            details: `Ancient instincts awaken. A wyrm has heard of ${rumor.itemName ?? "gold"} in ${rumor.target}.`,
            location: rumor.target,
            worldTime,
            realTime: new Date,
            seed: world.seed
          });
          queueConsequence({
            type: "dragon-seeks-treasure",
            triggerEvent: "Dragon seeks the treasure",
            turnsUntilResolution: 336 + rng.int(336),
            data: {
              target: rumor.target,
              itemName: rumor.itemName,
              discoveredBy: rumor.discoveredBy,
              value: rumor.estimatedValue
            },
            priority: 5
          });
        }
        break;
      case "antagonist":
        if (world.antagonists && world.antagonists.length > 0) {
          const antagonist = rng.pick(world.antagonists);
          if (antagonist.alive) {
            logs.push({
              category: "faction",
              summary: `${antagonist.name} covets ${rumor.itemName ?? "the treasure"}`,
              details: `The villain's agents are dispatched. ${rumor.discoveredBy} has drawn dangerous attention.`,
              location: antagonist.territory,
              actors: [antagonist.name, rumor.discoveredBy ?? "unknown"],
              worldTime,
              realTime: new Date,
              seed: world.seed
            });
            queueConsequence({
              type: "antagonist-seeks-item",
              triggerEvent: `${antagonist.name} hunts for ${rumor.itemName}`,
              turnsUntilResolution: 168 + rng.int(504),
              data: {
                antagonistId: antagonist.id,
                antagonistName: antagonist.name,
                itemName: rumor.itemName,
                targetParty: rumor.discoveredBy
              },
              priority: 5
            });
          }
        }
        break;
      case "faction":
        if (world.factions.length > 0) {
          const faction = rng.pick(world.factions);
          logs.push({
            category: "faction",
            summary: `${faction.name} take interest in ${rumor.itemName ?? "the treasure"}`,
            details: `The ${faction.focus} faction considers how ${rumor.itemName ?? "this treasure"} might serve their goals.`,
            location: rumor.origin,
            actors: [faction.name],
            worldTime,
            realTime: new Date,
            seed: world.seed
          });
          if (rng.chance(0.3)) {
            queueConsequence({
              type: "faction-acquires-item",
              triggerEvent: `${faction.name} moves to acquire ${rumor.itemName}`,
              turnsUntilResolution: 72 + rng.int(168),
              data: { factionId: faction.id, itemName: rumor.itemName, targetParty: rumor.discoveredBy },
              priority: 3
            });
          }
        }
        break;
      case "bandit":
        logs.push({
          category: "road",
          summary: `Bandits learn of ${rumor.discoveredBy}'s wealth`,
          details: `Cutthroats gather on the roads near ${rumor.target}. An ambush is being planned.`,
          location: rumor.target,
          worldTime,
          realTime: new Date,
          seed: world.seed
        });
        queueConsequence({
          type: "bandit-ambush",
          triggerEvent: "Bandits ambush treasure-laden party",
          turnsUntilResolution: 24 + rng.int(72),
          data: { targetParty: rumor.discoveredBy, location: rumor.target },
          priority: 4
        });
        break;
    }
    rumor.freshness = Math.max(0, rumor.freshness - 2);
  }
  return logs;
}
function tickTreasure(rng, treasureState, world, worldTime) {
  const logs = [];
  logs.push(...tickExtractions(rng, treasureState, world, worldTime));
  logs.push(...tickTreasureRumorReactions(rng, treasureState, world, worldTime));
  logs.push(...processTreasureInflux(rng, treasureState, world, worldTime));
  logs.push(...tickMagicItems(rng, treasureState, world, worldTime));
  return logs;
}

// src/dungeon.ts
var WANDER_ODDS_BY_TERRAIN = {
  road: 1 / 12,
  clear: 1 / 10,
  forest: 1 / 8,
  hills: 1 / 8,
  mountains: 1 / 6,
  swamp: 1 / 6,
  desert: 1 / 8,
  coastal: 1 / 8,
  ocean: 1 / 6,
  reef: 1 / 6,
  river: 1 / 10
};
var DUNGEON_WANDER_ODDS = 1 / 6;
var DUNGEON_FOES = ["giant rats", "skeletons", "kobolds", "goblins", "stirges", "spiders"];
var DUNGEON_TREASURE = ["tarnished coins", "old tapestries", "silver candlesticks", "uncut gems", "ancient scrolls"];
function wanderOutcome(rng, actors) {
  const foe = rng.pick(DUNGEON_FOES);
  const hostile = rng.chance(0.6);
  if (!hostile) {
    if (rng.chance(0.2)) {
      const loot = rng.pick(DUNGEON_TREASURE);
      return {
        summary: `${actors[0]} notice ${loot}`,
        details: "They mark the cache for later."
      };
    }
    return {
      summary: `${actors[0]} hear ${foe} nearby`,
      details: "Footsteps fade into the dark."
    };
  }
  const win = rng.chance(0.65);
  if (win) {
    return {
      summary: `${actors[0]} fend off ${foe}`,
      details: "Short clash in the corridors."
    };
  }
  return {
    summary: `${actors[0]} driven back by ${foe}`,
    details: "They fall back to safer halls."
  };
}
function dungeonWanders(rng, dungeon, actors, worldTime, seed, world) {
  if (!rng.chance(DUNGEON_WANDER_ODDS))
    return;
  const outcome = wanderOutcome(rng, actors);
  if (world && rng.chance(0.2)) {
    const partyName = actors[0];
    const party = world.parties.find((p) => p.name === partyName);
    if (party) {
      party.fame = (party.fame ?? 0) + 1;
    }
  }
  if (world && rng.chance(0.1)) {
    const rumor = createRumor(world, rng, dungeon.name, dungeon.name, "dungeon", `${actors[0]} whisper about ${dungeon.name}: ${outcome.summary}`);
    world.activeRumors.push(rumor);
    return logRumor(rumor, worldTime, seed);
  }
  return {
    category: "dungeon",
    summary: `${dungeon.name}: ${outcome.summary}`,
    details: outcome.details,
    location: dungeon.name,
    actors,
    worldTime,
    realTime: new Date,
    seed
  };
}

// src/travel.ts
function isDay(worldTime) {
  const hour = worldTime.getUTCHours();
  return hour >= 6 && hour < 18;
}
function pickDestination(world, rng, origin, partyGoal) {
  if (partyGoal)
    return partyGoal;
  const settlementNames = world.settlements.map((s) => s.name);
  const dungeonNames = world.dungeons.map((d) => d.name);
  const allDestinations = [
    ...settlementNames,
    ...settlementNames,
    ...dungeonNames
  ].filter((name) => name !== origin);
  if (!allDestinations.length)
    return origin;
  const party = world.parties.find((p) => p.location === origin);
  if (party && (party.fame ?? 0) >= 3 && rng.chance(0.4)) {
    const unexploredDungeons = world.dungeons.filter((d) => d.name !== origin && d.rooms && d.rooms.length > 0);
    if (unexploredDungeons.length > 0) {
      return rng.pick(unexploredDungeons).name;
    }
  }
  return rng.pick(allDestinations);
}
var TERRAIN_MILES_PER_DAY = {
  road: 36,
  clear: 24,
  forest: 16,
  hills: 16,
  mountains: 12,
  swamp: 12,
  desert: 16,
  coastal: 20,
  river: 8,
  ocean: 0,
  reef: 0
};
function milesPerHour(terrain) {
  const perDay = TERRAIN_MILES_PER_DAY[terrain] ?? 12;
  return perDay / 24;
}
function applyFatigueSpeed(baseMph, fatigue) {
  if (!fatigue || fatigue <= 0)
    return baseMph;
  const factor = 1 / (1 + 0.3 * fatigue);
  return baseMph * factor;
}
function ensureTravel(world, rng, worldTime) {
  const logs = [];
  let started = false;
  for (const party of world.parties) {
    if (party.restHoursRemaining && party.restHoursRemaining > 0)
      continue;
    if (party.status === "idle" && rng.chance(0.8)) {
      if (!party.goal) {
        const rumor = chooseRumorGoal(world, rng, party.id);
        if (rumor) {
          party.goal = { kind: "travel-to", target: rumor.target, sourceRumorId: rumor.id };
        }
      }
      const destination = pickDestination(world, rng, party.location, party.goal?.target);
      if (destination === party.location)
        continue;
      const distance = distanceMiles(world, party.location, destination);
      if (!distance || distance <= 0)
        continue;
      const terrain = pathTerrain(world, party.location, destination);
      const mph = applyFatigueSpeed(milesPerHour(terrain), party.fatigue);
      party.status = "travel";
      party.travel = {
        destination,
        terrain,
        milesRemaining: distance,
        milesPerHour: mph
      };
      logs.push({
        category: "road",
        summary: `${party.name} departs ${party.location}`,
        details: `Bound for ${destination} across ${terrain} (~${distance} miles).`,
        location: party.location,
        actors: [party.name],
        worldTime,
        realTime: new Date,
        seed: world.seed
      });
      started = true;
    }
  }
  if (!started) {
    const party = world.parties.find((p) => p.status === "idle");
    if (party) {
      if (party.restHoursRemaining && party.restHoursRemaining > 0) {
        return logs;
      }
      if (!party.goal) {
        const rumor = chooseRumorGoal(world, rng, party.id);
        if (rumor) {
          party.goal = { kind: "travel-to", target: rumor.target, sourceRumorId: rumor.id };
        }
      }
      const destination = pickDestination(world, rng, party.location, party.goal?.target);
      if (destination !== party.location) {
        const distance = distanceMiles(world, party.location, destination);
        if (distance && distance > 0) {
          const terrain = pathTerrain(world, party.location, destination);
          const mph = applyFatigueSpeed(milesPerHour(terrain), party.fatigue);
          party.status = "travel";
          party.travel = {
            destination,
            terrain,
            milesRemaining: distance,
            milesPerHour: mph
          };
          logs.push({
            category: "road",
            summary: `${party.name} departs ${party.location}`,
            details: `Bound for ${destination} across ${terrain} (~${distance} miles).`,
            location: party.location,
            actors: [party.name],
            worldTime,
            realTime: new Date,
            seed: world.seed
          });
        }
      }
    }
  }
  return logs;
}
function updateTravel(world, rng, worldTime) {
  const logs = [];
  for (const party of world.parties) {
    if (party.restHoursRemaining && party.restHoursRemaining > 0) {
      party.restHoursRemaining -= 1;
      if (party.restHoursRemaining <= 0) {
        party.restHoursRemaining = 0;
        party.wounded = false;
        logs.push({
          category: "road",
          summary: `${party.name} completes rest`,
          details: "Ready to travel again.",
          location: party.location,
          actors: [party.name],
          worldTime,
          realTime: new Date,
          seed: world.seed
        });
      }
    }
  }
  if (rng.chance(0.002)) {
    const id = `band-${world.parties.length}`;
    const name = `${randomName(rng)}'s Band`;
    world.parties.push({
      id,
      name,
      members: [randomName(rng), randomName(rng)],
      location: rng.pick(world.settlements).name,
      status: "idle"
    });
    logs.push({
      category: "faction",
      summary: `A new band appears near ${world.parties.at(-1)?.location ?? "the road"}`,
      details: `${name} takes to the byways.`,
      location: world.parties.at(-1)?.location,
      worldTime,
      realTime: new Date,
      seed: world.seed
    });
  }
  for (const party of world.parties) {
    if (party.status !== "travel" || !party.travel)
      continue;
    if (rng.chance(0.25)) {
      const encounter = maybeEncounter(rng, party.travel.terrain, worldTime, party.location, [party.name], world.seed);
      if (encounter) {
        if (encounter.delayMiles && encounter.delayMiles > 0) {
          party.travel.milesRemaining += encounter.delayMiles;
        }
        if (encounter.fatigueDelta && encounter.fatigueDelta > 0) {
          party.fatigue = (party.fatigue ?? 0) + encounter.fatigueDelta;
          party.travel.milesPerHour = applyFatigueSpeed(milesPerHour(party.travel.terrain), party.fatigue);
        }
        if (encounter.injured) {
          party.wounded = true;
          party.restHoursRemaining = Math.max(party.restHoursRemaining ?? 0, 24);
        }
        if (encounter.death) {
          party.fame = Math.max(0, (party.fame ?? 0) - 1);
          logs.push({
            category: "road",
            summary: `${party.name} suffers losses`,
            details: "A grim tally after the fight.",
            actors: [party.name],
            location: party.location,
            worldTime,
            realTime: new Date,
            seed: world.seed
          });
        } else {
          party.fame = (party.fame ?? 0) + 1;
        }
        logs.push(encounter);
      }
    }
    const destinationIsDungeon = world.dungeons.some((d) => d.name === party.travel.destination);
    if (destinationIsDungeon && rng.chance(0.3)) {
      const dungeon = world.dungeons.find((d) => d.name === party.travel.destination);
      const wand = dungeonWanders(rng, dungeon, [party.name], worldTime, world.seed, world);
      if (wand)
        logs.push(wand);
    }
    party.travel.milesRemaining -= party.travel.milesPerHour;
    if (party.travel.milesRemaining <= 0) {
      party.location = party.travel.destination;
      const arrivedAt = party.location;
      party.status = "idle";
      party.travel = undefined;
      if (party.goal && party.goal.target === arrivedAt) {
        party.goal = undefined;
      }
      if (party.fatigue && party.fatigue > 0) {
        party.fatigue = Math.max(0, party.fatigue - 1);
      }
      logs.push({
        category: "road",
        summary: `${party.name} arrives at ${arrivedAt}`,
        details: isDay(worldTime) ? "They find an inn and stable their mounts." : "They slip through the gates as lanterns are lit.",
        location: arrivedAt,
        actors: [party.name],
        worldTime,
        realTime: new Date,
        seed: world.seed
      });
      const dungeon = world.dungeons.find((d) => d.name === arrivedAt);
      if (dungeon) {}
      if ((party.fame ?? 0) >= 5 && rng.chance(0.3)) {
        logs.push({
          category: "town",
          summary: `${party.name} gain renown`,
          details: "Locals share tales of their exploits.",
          location: arrivedAt,
          worldTime,
          realTime: new Date,
          seed: world.seed
        });
      }
    }
  }
  return logs;
}
function maybeStartTravel(world, rng, worldTime) {
  return ensureTravel(world, rng, worldTime);
}

// src/persistence.ts
var { default: fs2} = (() => ({}));
var WORLD_PATH = "world.json";
var WORLD_SCHEMA_VERSION = 2;
var VALID_TERRAINS = [
  "road",
  "clear",
  "forest",
  "hills",
  "mountains",
  "swamp",
  "desert",
  "coastal",
  "ocean",
  "reef",
  "river"
];
function normalize2(world) {
  if (!world.schemaVersion)
    world.schemaVersion = 1;
  if (!world.activeRumors)
    world.activeRumors = [];
  if (!world.dungeons)
    world.dungeons = [];
  if (!world.roads)
    world.roads = [];
  if (!world.landmarks)
    world.landmarks = [];
  if (!world.ruins)
    world.ruins = [];
  if (!world.strongholds)
    world.strongholds = [];
  if (!world.armies)
    world.armies = [];
  if (!world.mercenaries)
    world.mercenaries = [];
  if (!world.nexuses)
    world.nexuses = [];
  const goods = ["grain", "timber", "ore", "textiles", "salt", "fish", "livestock"];
  for (const s of world.settlements) {
    if (!s.supply) {
      s.supply = Object.fromEntries(goods.map((g) => [g, 0]));
    }
    if (typeof s.mood !== "number")
      s.mood = 0;
    if (!s.priceTrends) {
      s.priceTrends = Object.fromEntries(goods.map((g) => [g, "normal"]));
    }
  }
  if (!world.npcs)
    world.npcs = [];
  for (const n of world.npcs) {
    if (n.alive === undefined)
      n.alive = true;
    if (n.fame === undefined)
      n.fame = 0;
  }
  if (!world.caravans)
    world.caravans = [];
  if (!world.factions)
    world.factions = [];
  for (const d of world.dungeons) {
    if (d.explored === undefined)
      d.explored = 0;
  }
  for (const hex of world.hexes) {
    if (!VALID_TERRAINS.includes(hex.terrain)) {
      console.warn(`Unknown terrain type "${hex.terrain}" at (${hex.coord.q},${hex.coord.r}), defaulting to "clear"`);
      hex.terrain = "clear";
    }
  }
  for (const party of world.parties) {
    if (party.fame === undefined)
      party.fame = 0;
    if (party.fatigue === undefined)
      party.fatigue = 0;
  }
  world.schemaVersion = WORLD_SCHEMA_VERSION;
  return world;
}
async function loadWorld() {
  try {
    const raw = await fs2.readFile(WORLD_PATH, "utf8");
    const parsed = JSON.parse(raw);
    const loadedVersion = parsed.schemaVersion ?? 1;
    if (loadedVersion < WORLD_SCHEMA_VERSION) {
      console.log(`\uD83D\uDCE6 Migrating world from schema v${loadedVersion} to v${WORLD_SCHEMA_VERSION}...`);
    }
    parsed.startedAt = new Date(parsed.startedAt);
    if (parsed.lastTickAt) {
      parsed.lastTickAt = new Date(parsed.lastTickAt);
    } else {
      parsed.lastTickAt = new Date(parsed.startedAt);
      console.log(`⏰ No lastTickAt found - using startedAt for catch-up baseline`);
    }
    if (parsed.storyThreads) {
      for (const story of parsed.storyThreads) {
        if (story.startedAt)
          story.startedAt = new Date(story.startedAt);
        if (story.lastUpdated)
          story.lastUpdated = new Date(story.lastUpdated);
        if (story.beats) {
          for (const beat of story.beats) {
            if (beat.timestamp)
              beat.timestamp = new Date(beat.timestamp);
          }
        }
      }
    }
    if (parsed.antagonists) {
      for (const ant of parsed.antagonists) {
        if (ant.lastSeen)
          ant.lastSeen = new Date(ant.lastSeen);
      }
    }
    const normalized = normalize2(parsed);
    console.log(`✓ World loaded successfully (schema v${WORLD_SCHEMA_VERSION})`);
    return normalized;
  } catch (err) {
    if (err.code === "ENOENT")
      return null;
    throw err;
  }
}
async function saveWorld(world) {
  const data = JSON.stringify(world, null, 2);
  await fs2.writeFile(WORLD_PATH, data, "utf8");
}

// src/travelers.ts
function chooseNPCEscort(world, rng) {
  const candidates = world.npcs.filter((n) => ["guard", "scout"].includes(n.role));
  if (!candidates.length)
    return null;
  return rng.pick(candidates);
}
function chooseNPCMerchant(world, rng) {
  const candidates = world.npcs.filter((n) => ["merchant", "bard"].includes(n.role));
  if (!candidates.length)
    return null;
  return rng.pick(candidates);
}

// src/causality.ts
function processWorldEvent(event, world, rng, antagonists, storyThreads) {
  const logs = [];
  if (!world.eventHistory)
    world.eventHistory = [];
  world.eventHistory.push(event);
  if (world.eventHistory.length > 200) {
    world.eventHistory = world.eventHistory.slice(-200);
  }
  switch (event.type) {
    case "raid":
      logs.push(...processRaid(event, world, rng, antagonists));
      break;
    case "battle":
      logs.push(...processBattle(event, world, rng));
      break;
    case "death":
      logs.push(...processDeath(event, world, rng, storyThreads));
      break;
    case "robbery":
      logs.push(...processRobbery(event, world, rng));
      break;
    case "assassination":
      logs.push(...processAssassination(event, world, rng, storyThreads));
      break;
    case "conquest":
      logs.push(...processConquest(event, world, rng));
      break;
    case "alliance":
      logs.push(...processAlliance(event, world, rng));
      break;
    case "betrayal":
      logs.push(...processBetrayal(event, world, rng, storyThreads));
      break;
    case "discovery":
      logs.push(...processDiscovery(event, world, rng));
      break;
  }
  logs.push(...createNPCMemories(event, world, rng));
  logs.push(...processSocialShifts(event, world, rng));
  logs.push(...updateStoryThreads(event, world, rng, storyThreads));
  if (event.witnessed && event.magnitude >= 3) {
    spreadEventAsRumor(event, world, rng);
  }
  return logs;
}
function processRaid(event, world, rng, antagonists) {
  const logs = [];
  const settlement = world.settlements.find((s) => s.name === event.location);
  if (!settlement)
    return logs;
  const { damage, loot, casualties } = event.data;
  const supplyTypes = Object.keys(settlement.supply);
  for (let i = 0;i < damage; i++) {
    const targetSupply = rng.pick(supplyTypes);
    settlement.supply[targetSupply] = Math.max(0, settlement.supply[targetSupply] - rng.int(5) - 1);
  }
  settlement.mood = Math.max(-5, settlement.mood - Math.ceil(damage / 2));
  const state = getSettlementState(world, settlement.name);
  state.safety = Math.max(-10, state.safety - damage);
  state.recentEvents.push(event.id);
  if (damage >= 3) {
    state.populationDelta -= Math.floor(damage * 10);
    logs.push({
      category: "town",
      summary: `Refugees flee ${settlement.name}`,
      details: `The raid drives families from their homes. The roads fill with the displaced.`,
      location: settlement.name,
      worldTime: event.timestamp,
      realTime: new Date,
      seed: world.seed
    });
  }
  const npcsHere = world.npcs.filter((n) => n.location === settlement.name && n.alive !== false);
  for (let i = 0;i < casualties && npcsHere.length > 0; i++) {
    const victim = rng.pick(npcsHere);
    if (rng.chance(0.3)) {
      victim.alive = false;
      logs.push(...processDeath({
        ...event,
        id: `${event.id}-death-${i}`,
        type: "death",
        victims: [victim.name],
        data: { cause: "raid", killedBy: event.perpetrators?.[0] }
      }, world, rng, []));
    } else {
      victim.morale = (victim.morale ?? 0) - 3;
      const memory = createRichMemory("was-attacked", "raid", event.timestamp, event.location, rng.pick(["angry", "fearful", "bitter"]), 5 + rng.int(5), event.perpetrators?.[0], undefined, undefined, false);
      addNPCMemory(victim, memory);
    }
  }
  for (const faction of world.factions) {
    const attitude = faction.attitude[settlement.name] ?? 0;
    if (attitude > 0) {
      const factionState = getFactionState(world, faction.id);
      factionState.recentLosses += damage;
      if (factionState.recentLosses >= 5) {
        queueConsequence({
          type: "faction-action",
          triggerEvent: `Raid on ${settlement.name}`,
          turnsUntilResolution: 6 + rng.int(12),
          data: {
            factionId: faction.id,
            action: "retaliate",
            targetLocation: settlement.name
          },
          priority: 5
        });
        logs.push({
          category: "faction",
          summary: `${faction.name} musters for war`,
          details: `The attacks on ${settlement.name} cannot go unanswered. ${faction.name} gathers its strength.`,
          location: settlement.name,
          actors: [faction.name],
          worldTime: event.timestamp,
          realTime: new Date,
          seed: world.seed
        });
        factionState.recentLosses = 0;
      }
    }
  }
  const partiesNearby = world.parties.filter((p) => p.location === settlement.name || p.travel && p.travel.destination === settlement.name);
  for (const party of partiesNearby) {
    const partyState = getPartyState(world, party.id);
    if (event.perpetrators?.length && rng.chance(0.5)) {
      partyState.vendetta = event.perpetrators[0];
      partyState.enemies = [...new Set([...partyState.enemies ?? [], event.perpetrators[0]])];
      logs.push({
        category: "road",
        summary: `${party.name} vows to hunt the raiders`,
        details: `Witnessing the devastation, they swear to bring ${event.perpetrators[0]} to justice.`,
        location: settlement.name,
        actors: [party.name, event.perpetrators[0]],
        worldTime: event.timestamp,
        realTime: new Date,
        seed: world.seed
      });
      partyState.questLog = partyState.questLog ?? [];
      partyState.questLog.push({
        id: `quest-${Date.now()}`,
        type: "hunt",
        target: event.perpetrators[0],
        reason: `Avenge the raid on ${settlement.name}`,
        progress: 0
      });
    }
  }
  return logs;
}
function processBattle(event, world, rng) {
  const logs = [];
  const { victor, loser, significance } = event.data;
  const victorParty = world.parties.find((p) => p.name === victor);
  const loserParty = world.parties.find((p) => p.name === loser);
  const victorFaction = world.factions.find((f) => f.name === victor);
  const loserFaction = world.factions.find((f) => f.name === loser);
  if (victorParty) {
    const state = getPartyState(world, victorParty.id);
    state.morale = Math.min(10, (state.morale ?? 0) + significance);
    victorParty.fame = (victorParty.fame ?? 0) + significance;
    if (state.vendetta === loser) {
      state.vendetta = undefined;
      state.killList = [...state.killList ?? [], loser];
      logs.push({
        category: "road",
        summary: `${victorParty.name} completes their vendetta`,
        details: `${loser} falls. The oath is fulfilled.`,
        location: event.location,
        actors: [victorParty.name],
        worldTime: event.timestamp,
        realTime: new Date,
        seed: world.seed
      });
    }
  }
  if (loserParty) {
    const state = getPartyState(world, loserParty.id);
    state.morale = Math.max(-10, (state.morale ?? 0) - significance);
    loserParty.fame = Math.max(0, (loserParty.fame ?? 0) - 1);
    loserParty.wounded = true;
    loserParty.restHoursRemaining = 24 + rng.int(24);
    if (significance >= 3 && rng.chance(0.5)) {
      state.vendetta = victor;
      state.enemies = [...new Set([...state.enemies ?? [], victor])];
    }
  }
  if (victorFaction) {
    const state = getFactionState(world, victorFaction.id);
    state.recentWins += significance;
    state.power = Math.min(100, state.power + significance * 2);
    if (state.recentWins >= 5) {
      logs.push({
        category: "faction",
        summary: `${victorFaction.name} grows bold`,
        details: `Emboldened by recent victories, they eye new territories.`,
        location: event.location,
        actors: [victorFaction.name],
        worldTime: event.timestamp,
        realTime: new Date,
        seed: world.seed
      });
      state.recentWins = 0;
    }
  }
  if (loserFaction) {
    const state = getFactionState(world, loserFaction.id);
    state.recentLosses += significance;
    state.power = Math.max(0, state.power - significance * 2);
    state.morale = Math.max(-10, (state.morale ?? 0) - significance);
    if (victorFaction && !state.enemies.includes(victorFaction.id)) {
      state.enemies.push(victorFaction.id);
      logs.push({
        category: "faction",
        summary: `${loserFaction.name} declares ${victorFaction.name} their enemy`,
        details: `Blood demands blood. Open warfare may follow.`,
        location: event.location,
        actors: [loserFaction.name, victorFaction.name],
        worldTime: event.timestamp,
        realTime: new Date,
        seed: world.seed
      });
    }
  }
  const settlement = world.settlements.find((s) => s.name === event.location);
  if (settlement) {
    settlement.mood = Math.max(-5, settlement.mood - 1);
    const state = getSettlementState(world, settlement.name);
    state.safety -= 1;
    state.recentEvents.push(event.id);
    if (significance >= 3) {
      state.unrest = Math.min(10, (state.unrest ?? 0) + 1);
    }
  }
  return logs;
}
function processDeath(event, world, rng, storyThreads) {
  const logs = [];
  const { cause, killedBy } = event.data;
  const victimName = event.victims?.[0];
  if (!victimName)
    return logs;
  const victim = world.npcs.find((n) => n.name === victimName || n.id === victimName);
  const victimAntagonist = world.antagonists?.find((a) => a.name === victimName);
  if (victim) {
    victim.alive = false;
    const reactiveNpc = victim;
    if (reactiveNpc.depth?.relationships) {
      for (const rel of reactiveNpc.depth.relationships) {
        const relatedNpc = world.npcs.find((n) => n.id === rel.targetId);
        if (!relatedNpc || relatedNpc.alive === false)
          continue;
        const deathEmotion = rel.type === "enemy" ? "grateful" : killedBy ? "angry" : "grieving";
        const deathMemory = createRichMemory(rel.type === "enemy" ? "witnessed-death" : "lost-loved-one", "death", event.timestamp, event.location, deathEmotion, 5 + rel.strength, killedBy ?? victim.name, undefined, victim.name, false);
        addNPCMemory(relatedNpc, deathMemory);
        if (["ally", "lover", "kin", "mentor"].includes(rel.type) && killedBy) {
          addNPCAgenda(relatedNpc, {
            type: "revenge",
            target: killedBy,
            priority: 7 + rng.int(3),
            progress: 0,
            description: `Avenge ${victim.name}'s death at the hands of ${killedBy}`
          });
          logs.push({
            category: "town",
            summary: `${relatedNpc.name} swears vengeance for ${victim.name}`,
            details: `The ${relatedNpc.role}'s grief turns to cold fury. ${killedBy} has made a powerful enemy.`,
            location: relatedNpc.location,
            actors: [relatedNpc.name, killedBy],
            worldTime: event.timestamp,
            realTime: new Date,
            seed: world.seed
          });
        }
      }
    }
    const faction = world.factions.find((f) => world.npcs.some((n) => n.loyalty === f.id && n.id === victim.id));
    if (faction) {
      const state = getFactionState(world, faction.id);
      state.recentLosses += 2;
      state.morale = Math.max(-10, (state.morale ?? 0) - 2);
      if (killedBy) {
        const killerFaction = world.factions.find((f) => f.name === killedBy);
        if (killerFaction && !state.enemies.includes(killerFaction.id)) {
          state.enemies.push(killerFaction.id);
        }
      }
    }
    const settlement = world.settlements.find((s) => s.name === victim.location);
    if (settlement) {
      const settState = getSettlementState(world, settlement.name);
      if (victim.fame && victim.fame >= 3) {
        settlement.mood = Math.max(-5, settlement.mood - 2);
        settState.unrest = Math.min(10, (settState.unrest ?? 0) + 1);
        logs.push({
          category: "town",
          summary: `${settlement.name} mourns ${victim.name}`,
          details: `A notable figure has fallen. The settlement is shaken.`,
          location: settlement.name,
          worldTime: event.timestamp,
          realTime: new Date,
          seed: world.seed
        });
      }
    }
  }
  if (victimAntagonist) {
    victimAntagonist.alive = false;
    for (const settlement of world.settlements) {
      queueConsequence({
        type: "spawn-rumor",
        triggerEvent: `Death of ${victimAntagonist.name}`,
        turnsUntilResolution: 1 + rng.int(3),
        data: {
          origin: settlement.name,
          target: event.location,
          kind: "mystery",
          text: `${victimAntagonist.name} ${victimAntagonist.epithet} is dead! Slain near ${event.location}.`
        },
        priority: 5
      });
    }
    if (victimAntagonist.minions && victimAntagonist.minions > 0) {
      if (rng.chance(0.5)) {
        logs.push({
          category: "faction",
          summary: `${victimAntagonist.name}'s followers scatter`,
          details: `With their leader dead, the remaining minions flee into the wilds.`,
          location: event.location,
          worldTime: event.timestamp,
          realTime: new Date,
          seed: world.seed
        });
      } else {
        logs.push({
          category: "faction",
          summary: `${victimAntagonist.name}'s followers swear vengeance`,
          details: `A new leader rises from the ashes, vowing to continue the fallen master's work.`,
          location: event.location,
          worldTime: event.timestamp,
          realTime: new Date,
          seed: world.seed
        });
        queueConsequence({
          type: "spawn-antagonist",
          triggerEvent: `Succession of ${victimAntagonist.name}`,
          turnsUntilResolution: 48 + rng.int(72),
          data: {
            location: event.location,
            threat: `A successor to ${victimAntagonist.name}`,
            origin: `The death of ${victimAntagonist.name}`
          },
          priority: 4
        });
      }
    }
  }
  return logs;
}
function processRobbery(event, world, rng) {
  const logs = [];
  const { value, targetType, factionId, goods } = event.data;
  if (targetType === "caravan") {
    const nearestSettlement = world.settlements.find((s) => s.name === event.location);
    if (nearestSettlement) {
      const state = getSettlementState(world, nearestSettlement.name);
      state.safety -= 2;
      state.prosperity -= 1;
      logs.push({
        category: "town",
        summary: `Trade routes near ${nearestSettlement.name} grow dangerous`,
        details: `Merchants speak of losses. Some refuse to travel until the roads are secured.`,
        location: nearestSettlement.name,
        worldTime: event.timestamp,
        realTime: new Date,
        seed: world.seed
      });
    }
    if (factionId && event.perpetrators?.length) {
      const fState = getFactionState(world, factionId);
      const perp = event.perpetrators[0];
      const perpFaction = world.factions.find((f) => f.name === perp || f.id === perp);
      if (perpFaction) {
        fState.casusBelli[perpFaction.id] = {
          reason: `the robbery of their caravan near ${event.location}`,
          magnitude: 5
        };
        if (!fState.enemies.includes(perpFaction.id)) {
          fState.enemies.push(perpFaction.id);
        }
      }
    }
  }
  if (event.perpetrators?.length) {
    const perpetrator = event.perpetrators[0];
    const party = world.parties.find((p) => p.name === perpetrator);
    if (party) {
      const state = getPartyState(world, party.id);
      state.resources = (state.resources ?? 0) + value;
    }
  }
  return logs;
}
function processAssassination(event, world, rng, storyThreads) {
  const logs = [];
  logs.push(...processDeath(event, world, rng, storyThreads));
  const victim = world.npcs.find((n) => n.name === event.victims?.[0]);
  if (victim) {
    const settlement = world.settlements.find((s) => s.name === victim.location);
    if (settlement) {
      const state = getSettlementState(world, settlement.name);
      state.unrest = Math.min(10, (state.unrest ?? 0) + 3);
      if (state.rulerNpcId === victim.id) {
        state.rulerNpcId = undefined;
        state.contested = true;
        logs.push({
          category: "town",
          summary: `${settlement.name} plunges into chaos`,
          details: `With their leader dead, factions vie for control. The streets grow tense.`,
          location: settlement.name,
          worldTime: event.timestamp,
          realTime: new Date,
          seed: world.seed
        });
      }
    }
  }
  return logs;
}
function processConquest(event, world, rng) {
  const logs = [];
  const { conqueror, previous } = event.data;
  const settlement = world.settlements.find((s) => s.name === event.location);
  if (!settlement)
    return logs;
  const state = getSettlementState(world, settlement.name);
  const conquerorFaction = world.factions.find((f) => f.id === conqueror || f.name === conqueror);
  if (conquerorFaction) {
    state.controlledBy = conquerorFaction.id;
    state.contested = false;
    const factionState = getFactionState(world, conquerorFaction.id);
    if (!factionState.territory.includes(settlement.name)) {
      factionState.territory.push(settlement.name);
    }
    factionState.power += 10;
    if (previous) {
      const prevFaction = world.factions.find((f) => f.id === previous || f.name === previous);
      if (prevFaction) {
        const prevState = getFactionState(world, prevFaction.id);
        prevState.territory = prevState.territory.filter((t) => t !== settlement.name);
        prevState.power = Math.max(0, prevState.power - 10);
        prevState.morale -= 3;
        if (!prevState.enemies.includes(conquerorFaction.id)) {
          prevState.enemies.push(conquerorFaction.id);
        }
        if (!factionState.enemies.includes(prevFaction.id)) {
          factionState.enemies.push(prevFaction.id);
        }
      }
    }
    const existingAttitude = conquerorFaction.attitude[settlement.name] ?? 0;
    settlement.mood = existingAttitude > 0 ? 1 : -2;
    logs.push({
      category: "faction",
      summary: `${settlement.name} falls under ${conquerorFaction.name} control`,
      details: previous ? `The banners of ${previous} are torn down. New masters rule.` : `A new power claims this settlement as their own.`,
      location: settlement.name,
      actors: [conquerorFaction.name],
      worldTime: event.timestamp,
      realTime: new Date,
      seed: world.seed
    });
  }
  return logs;
}
function processAlliance(event, world, rng) {
  const logs = [];
  const [faction1Name, faction2Name] = event.actors;
  const faction1 = world.factions.find((f) => f.name === faction1Name);
  const faction2 = world.factions.find((f) => f.name === faction2Name);
  if (faction1 && faction2) {
    const state1 = getFactionState(world, faction1.id);
    const state2 = getFactionState(world, faction2.id);
    if (!state1.allies.includes(faction2.id))
      state1.allies.push(faction2.id);
    if (!state2.allies.includes(faction1.id))
      state2.allies.push(faction1.id);
    state1.enemies = state1.enemies.filter((e) => e !== faction2.id);
    state2.enemies = state2.enemies.filter((e) => e !== faction1.id);
    const commonEnemies = state1.enemies.filter((e) => state2.enemies.includes(e));
    if (commonEnemies.length > 0) {
      const enemyFaction = world.factions.find((f) => f.id === commonEnemies[0]);
      if (enemyFaction) {
        logs.push({
          category: "faction",
          summary: `${faction1.name} and ${faction2.name} unite against ${enemyFaction.name}`,
          details: `A pact is sealed. Their common enemy should be worried.`,
          location: event.location,
          actors: [faction1.name, faction2.name],
          worldTime: event.timestamp,
          realTime: new Date,
          seed: world.seed
        });
      }
    }
  }
  return logs;
}
function processBetrayal(event, world, rng, storyThreads) {
  const logs = [];
  const { betrayer, betrayed, nature } = event.data;
  const betrayedNpc = world.npcs.find((n) => n.name === betrayed);
  const betrayedFaction = world.factions.find((f) => f.name === betrayed);
  const betrayedParty = world.parties.find((p) => p.name === betrayed);
  if (betrayedNpc && betrayedNpc.alive !== false) {
    const betrayalMemory = createRichMemory("was-betrayed", "betrayal", event.timestamp, event.location, "angry", 10, betrayer, undefined, undefined, false);
    addNPCMemory(betrayedNpc, betrayalMemory);
    addNPCAgenda(betrayedNpc, {
      type: "revenge",
      target: betrayer,
      priority: 10,
      progress: 0,
      description: `Make ${betrayer} pay for their treachery`,
      sourceMemoryId: betrayalMemory.id
    });
    logs.push({
      category: "town",
      summary: `${betrayedNpc.name} learns of ${betrayer}'s betrayal`,
      details: `Trust shattered, the ${betrayedNpc.role} speaks of nothing but revenge.`,
      location: betrayedNpc.location,
      actors: [betrayedNpc.name, betrayer],
      worldTime: event.timestamp,
      realTime: new Date,
      seed: world.seed
    });
  }
  if (betrayedParty) {
    const state = getPartyState(world, betrayedParty.id);
    state.vendetta = betrayer;
    state.morale = Math.max(-10, (state.morale ?? 0) - 5);
    state.enemies = [...new Set([...state.enemies ?? [], betrayer])];
    state.allies = (state.allies ?? []).filter((a) => a !== betrayer);
  }
  if (betrayedFaction) {
    const betrayerFaction = world.factions.find((f) => f.name === betrayer);
    if (betrayerFaction) {
      const state = getFactionState(world, betrayedFaction.id);
      state.allies = state.allies.filter((a) => a !== betrayerFaction.id);
      if (!state.enemies.includes(betrayerFaction.id)) {
        state.enemies.push(betrayerFaction.id);
      }
    }
  }
  return logs;
}
function generateMemoryId() {
  return `mem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
function createRichMemory(category, eventType, timestamp, location, emotion, intensity, target, targetId, secondaryTarget, secret = false) {
  const narratives = {
    "was-betrayed": [
      `remembers when ${target ?? "someone trusted"} betrayed them`,
      `will never forget the knife in the back from ${target ?? "an ally"}`,
      `still tastes the bitterness of ${target ?? "that"} betrayal`
    ],
    "was-attacked": [
      `bears scars from the attack by ${target ?? "assailants"}`,
      `remembers the violence done by ${target ?? "enemies"}`,
      `flinches at memories of ${target ?? "that"} assault`
    ],
    "was-robbed": [
      `lost everything to ${target ?? "thieves"}`,
      `remembers when ${target ?? "bandits"} took what was theirs`,
      `still seethes at the theft by ${target ?? "criminals"}`
    ],
    "was-insulted": [
      `burns with shame from ${target ?? "public"} humiliation`,
      `will not forget the insult delivered by ${target ?? "that snake"}`,
      `remembers every word of ${target ?? "the"} mockery`
    ],
    "was-threatened": [
      `lives with the threat made by ${target ?? "enemies"}`,
      `sleeps poorly since ${target ?? "those"} threats`,
      `knows ${target ?? "someone"} wants them dead`
    ],
    "lost-loved-one": [
      `grieves for ${target ?? "the fallen"}`,
      `carries the loss of ${target ?? "loved ones"} every day`,
      `lights candles for ${target ?? "the dead"}`
    ],
    "lost-home": [
      `dreams of ${target ?? "their lost home"}`,
      `has no place to return to since ${target ?? "the destruction"}`,
      `wanders, homeless since ${target ?? "that day"}`
    ],
    "was-imprisoned": [
      `knows the inside of ${target ?? "a cell"} too well`,
      `still has nightmares of ${target ?? "imprisonment"}`,
      `values freedom after ${target ?? "captivity"}`
    ],
    "was-exiled": [
      `was cast out of ${target ?? "their homeland"}`,
      `remembers the gates of ${target ?? "home"} closing forever`,
      `burns to return to ${target ?? "where they belong"}`
    ],
    "was-saved": [
      `owes their life to ${target ?? "a savior"}`,
      `will never forget when ${target ?? "someone"} rescued them`,
      `considers ${target ?? "their rescuer"} the truest friend`
    ],
    "was-healed": [
      `was brought back from death's door by ${target ?? "a healer"}`,
      `owes their health to ${target ?? "skilled hands"}`,
      `remembers ${target ?? "who"} drove away the fever`
    ],
    "was-enriched": [
      `prospered thanks to ${target ?? "a benefactor"}`,
      `remembers when ${target ?? "fortune"} smiled upon them`,
      `knows ${target ?? "who"} made them wealthy`
    ],
    "was-defended": [
      `remembers when ${target ?? "a champion"} stood for them`,
      `knows ${target ?? "who"} had their back when it mattered`,
      `will always be grateful to ${target ?? "their defender"}`
    ],
    "was-taught": [
      `learned everything from ${target ?? "a mentor"}`,
      `carries the lessons of ${target ?? "a teacher"} still`,
      `owes their skills to ${target ?? "a master"}`
    ],
    "was-promoted": [
      `rose high thanks to ${target ?? "opportunity"}`,
      `remembers when ${target ?? "fortune"} elevated them`,
      `knows ${target ?? "who"} saw their potential`
    ],
    "was-married": [
      `wed ${target ?? "their spouse"} in ${location}`,
      `remembers the day ${target ?? "they"} exchanged vows`,
      `built a life with ${target ?? "a partner"}`
    ],
    "had-child": [
      `became a parent when ${target ?? "their child"} was born`,
      `remembers the cry of ${target ?? "their newborn"}`,
      `lives now for ${target ?? "their children"}`
    ],
    "was-forgiven": [
      `was pardoned by ${target ?? "those wronged"}`,
      `received mercy from ${target ?? "the aggrieved"}`,
      `knows the weight lifted by ${target ?? "forgiveness"}`
    ],
    "witnessed-heroism": [
      `saw ${target ?? "a hero"} do the impossible`,
      `witnessed ${target ?? "true"} bravery`,
      `tells tales of ${target ?? "heroic"} deeds`
    ],
    "witnessed-cruelty": [
      `saw what ${target ?? "monsters"} are capable of`,
      `witnessed atrocities committed by ${target ?? "the cruel"}`,
      `cannot unsee what ${target ?? "evil"} did`
    ],
    "witnessed-miracle": [
      `saw divine intervention in ${location}`,
      `witnessed ${target ?? "a miracle"} that changed everything`,
      `knows the gods are real after ${target ?? "the miracle"}`
    ],
    "witnessed-betrayal": [
      `saw ${target ?? "someone"} betray ${secondaryTarget ?? "an ally"}`,
      `witnessed treachery between ${target ?? "allies"}`,
      `knows what ${target ?? "the traitor"} is capable of`
    ],
    "witnessed-death": [
      `watched ${target ?? "someone"} die`,
      `was there when ${target ?? "they"} fell`,
      `carries the memory of ${target ?? "death"}`
    ],
    "witnessed-discovery": [
      `was present when ${target ?? "secrets"} were revealed`,
      `saw ${target ?? "the discovery"} that changed everything`,
      `knows what was found in ${location}`
    ],
    "witnessed-battle": [
      `survived the battle at ${location}`,
      `saw ${target ?? "armies"} clash`,
      `knows the chaos of combat firsthand`
    ],
    "witnessed-festival": [
      `celebrated ${target ?? "the festival"} in ${location}`,
      `remembers the joy of ${target ?? "that celebration"}`,
      `danced and drank at ${target ?? "the feast"}`
    ],
    "committed-violence": [
      `shed ${target ?? "blood"} with their own hands`,
      `remembers striking down ${target ?? "an enemy"}`,
      `knows the weight of killing ${target ?? "another"}`
    ],
    "committed-betrayal": [
      `betrayed ${target ?? "someone who trusted them"}`,
      `turned on ${target ?? "an ally"} when it served them`,
      `knows they wronged ${target ?? "a friend"}`
    ],
    "committed-theft": [
      `stole from ${target ?? "others"}`,
      `took what belonged to ${target ?? "someone else"}`,
      `prospers from ${target ?? "theft"}`
    ],
    "committed-heroism": [
      `saved ${target ?? "lives"} through courage`,
      `stood against ${target ?? "danger"} when others fled`,
      `earned glory through ${target ?? "brave deeds"}`
    ],
    "committed-mercy": [
      `spared ${target ?? "those"} they could have destroyed`,
      `showed compassion to ${target ?? "enemies"}`,
      `let ${target ?? "the fallen"} live`
    ],
    "committed-cruelty": [
      `did terrible things to ${target ?? "victims"}`,
      `showed no mercy to ${target ?? "the helpless"}`,
      `carries dark deeds against ${target ?? "innocents"}`
    ],
    "broke-oath": [
      `violated their promise to ${target ?? "someone"}`,
      `broke faith with ${target ?? "those who trusted"}`,
      `is known to have lied to ${target ?? "allies"}`
    ],
    "kept-oath": [
      `honored their word to ${target ?? "all"} despite the cost`,
      `proved their loyalty to ${target ?? "their promise"}`,
      `paid dearly to keep faith with ${target ?? "an oath"}`
    ],
    "made-friend": [
      `formed a bond with ${target ?? "an ally"}`,
      `found a true companion in ${target ?? "someone"}`,
      `counts ${target ?? "a new friend"} among allies`
    ],
    "made-enemy": [
      `earned the hatred of ${target ?? "an enemy"}`,
      `crossed ${target ?? "someone dangerous"}`,
      `knows ${target ?? "a foe"} wishes them ill`
    ],
    "lost-friend": [
      `lost ${target ?? "a friend"} to circumstance or death`,
      `mourns the friendship with ${target ?? "an old ally"}`,
      `no longer speaks with ${target ?? "a former friend"}`
    ],
    reconciled: [
      `mended the rift with ${target ?? "an estranged ally"}`,
      `forgave ${target ?? "an old wrong"} and moved on`,
      `rebuilt the bond with ${target ?? "someone lost"}`
    ],
    "fell-in-love": [
      `loves ${target ?? "someone"} deeply`,
      `burns with passion for ${target ?? "another"}`,
      `dreams of ${target ?? "their beloved"}`
    ],
    "fell-out-of-love": [
      `no longer loves ${target ?? "a former partner"}`,
      `watches ${target ?? "their ex"} with cold eyes`,
      `wonders what they ever saw in ${target ?? "that one"}`
    ],
    "was-rejected": [
      `was spurned by ${target ?? "the one they loved"}`,
      `knows ${target ?? "that person"} will never return their feelings`,
      `carries the sting of ${target ?? "romantic"} rejection`
    ],
    "discovered-secret": [
      `knows ${target ?? "someone's"} darkest secret`,
      `learned what ${target ?? "others"} tried to hide`,
      `holds dangerous knowledge about ${target ?? "certain parties"}`
    ]
  };
  const narrativeOptions = narratives[category] ?? [`remembers something about ${target ?? "the past"}`];
  const narrative = narrativeOptions[Math.floor(Math.random() * narrativeOptions.length)];
  return {
    id: generateMemoryId(),
    category,
    eventType,
    timestamp,
    location,
    emotion,
    target,
    targetId,
    secondaryTarget,
    intensity,
    acted: false,
    narrative,
    secret
  };
}
function addNPCMemory(npc, memory) {
  if (!npc.memories)
    npc.memories = [];
  npc.memories.push(memory);
  if (npc.memories.length > 30) {
    npc.memories.sort((a, b) => b.intensity - a.intensity || new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    npc.memories = npc.memories.slice(0, 30);
  }
}
function addNPCAgenda(npc, agenda) {
  if (!npc.agendas)
    npc.agendas = [];
  if (npc.agendas.some((a) => a.type === agenda.type && a.target === agenda.target))
    return;
  npc.agendas.push(agenda);
}
function createNPCMemories(event, world, rng) {
  const logs = [];
  if (!event.witnessed)
    return logs;
  const witnesses = world.npcs.filter((n) => n.location === event.location && n.alive !== false);
  const eventToCategory = {
    battle: "witnessed-battle",
    raid: "was-attacked",
    death: "witnessed-death",
    betrayal: "witnessed-betrayal",
    discovery: "witnessed-discovery",
    miracle: "witnessed-miracle",
    festival: "witnessed-festival"
  };
  const eventToEmotion = {
    battle: ["fearful", "angry", "proud"],
    raid: ["fearful", "angry"],
    death: ["grieving", "fearful"],
    betrayal: ["suspicious", "angry"],
    miracle: ["inspired", "hopeful"],
    festival: ["hopeful", "grateful"],
    discovery: ["inspired", "suspicious"]
  };
  for (const witness of witnesses) {
    if (rng.chance(0.35)) {
      const reactiveNpc = witness;
      const category = eventToCategory[event.type] ?? "witnessed-battle";
      const emotionPool = eventToEmotion[event.type] ?? ["suspicious"];
      const emotion = rng.pick(emotionPool);
      const memory = createRichMemory(category, event.type, event.timestamp, event.location, emotion, event.magnitude, event.actors?.[0], undefined, event.actors?.[1], false);
      addNPCMemory(reactiveNpc, memory);
    }
  }
  return logs;
}
function updateStoryThreads(event, world, rng, storyThreads) {
  const logs = [];
  for (const story of storyThreads) {
    if (story.resolved)
      continue;
    const eventActors = new Set([...event.actors ?? [], ...event.victims ?? [], ...event.perpetrators ?? []]);
    const storyActors = new Set(story.actors);
    const overlap = [...eventActors].some((a) => storyActors.has(a));
    if (!overlap)
      continue;
    story.lastUpdated = event.timestamp;
    story.beats.push({
      timestamp: event.timestamp,
      summary: event.type === "death" ? `A key figure falls.` : event.type === "battle" ? `Blood is spilled.` : `Events unfold.`,
      tensionChange: event.magnitude > 5 ? 2 : 1
    });
    story.tension = Math.min(10, story.tension + event.magnitude / 3);
    if (story.tension >= 8 && story.phase !== "climax") {
      story.phase = "climax";
      logs.push({
        category: "faction",
        summary: `${story.title} approaches its climax`,
        details: `The threads of fate draw tight. A decisive moment is at hand.`,
        location: story.location,
        actors: story.actors,
        worldTime: event.timestamp,
        realTime: new Date,
        seed: world.seed
      });
    } else if (story.tension >= 5 && story.phase === "inciting") {
      story.phase = "rising";
    }
    if (event.type === "death" && event.victims?.some((v) => story.actors.includes(v))) {
      if (story.type === "hunt" && story.actors[1] && event.victims.includes(story.actors[1])) {
        story.resolved = true;
        story.phase = "resolution";
        story.resolution = "The hunt ends in blood.";
        logs.push({
          category: "faction",
          summary: `"${story.title}" concludes`,
          details: story.resolution,
          location: event.location,
          actors: story.actors,
          worldTime: event.timestamp,
          realTime: new Date,
          seed: world.seed
        });
      }
    }
  }
  return logs;
}
function spreadEventAsRumor(event, world, rng) {
  const originSettlement = world.settlements.find((s) => s.name === event.location);
  if (!originSettlement)
    return;
  for (const settlement of world.settlements) {
    if (settlement.name === event.location)
      continue;
    if (rng.chance(0.3)) {
      queueConsequence({
        type: "spawn-rumor",
        triggerEvent: event.type,
        turnsUntilResolution: 6 + rng.int(24),
        data: {
          origin: settlement.name,
          target: event.location,
          kind: "mystery",
          text: generateRumorText(event, rng)
        },
        priority: event.magnitude
      });
    }
  }
}
function generateRumorText(event, rng) {
  const templates = {
    raid: [
      `Raiders struck at ${event.location}. They say ${event.perpetrators?.[0] ?? "bandits"} were responsible.`,
      `${event.location} was attacked! Survivors speak of ${event.perpetrators?.[0] ?? "unknown assailants"}.`
    ],
    battle: [
      `A battle was fought near ${event.location}. Blood stains the earth.`,
      `${event.actors?.join(" and ") ?? "Warriors"} clashed at ${event.location}.`
    ],
    death: [
      `${event.victims?.[0] ?? "Someone important"} has died at ${event.location}.`,
      `They say ${event.victims?.[0] ?? "a notable figure"} met their end. Foul play is suspected.`
    ],
    robbery: [
      `Thieves struck near ${event.location}. The roads grow dangerous.`,
      `A valuable shipment was lost near ${event.location}.`
    ],
    discovery: [
      `Something wondrous was found near ${event.location}!`,
      `Treasure-seekers should head to ${event.location}, they say.`
    ],
    alliance: [
      `${event.actors?.join(" and ") ?? "Great powers"} have joined forces.`,
      `A pact was sealed. The balance of power shifts.`
    ],
    betrayal: [
      `Treachery most foul! ${event.actors?.[0] ?? "Someone"} broke faith.`,
      `Trust is a currency spent in ${event.location}.`
    ],
    conquest: [
      `${event.location} has new masters now.`,
      `The banners have changed at ${event.location}.`
    ],
    disaster: [
      `Catastrophe struck ${event.location}. The gods must be angry.`,
      `${event.location} suffers greatly. Refugees flee.`
    ],
    miracle: [
      `A miracle occurred at ${event.location}! The faithful rejoice.`,
      `Divine favor shines upon ${event.location}.`
    ],
    assassination: [
      `${event.victims?.[0] ?? "A leader"} was murdered. Intrigue thickens.`,
      `Someone paid for ${event.victims?.[0] ?? "a death"} in ${event.location}.`
    ],
    recruitment: [`A faction grows stronger.`],
    defection: [`Loyalties shift.`],
    "trade-deal": [`Commerce flows.`],
    embargo: [`Trade routes close.`],
    festival: [`Celebration in ${event.location}!`],
    plague: [`Sickness spreads from ${event.location}. Avoid the afflicted.`],
    famine: [`${event.location} starves. Food is worth gold.`],
    uprising: [`The people of ${event.location} rise against their masters!`],
    prophecy: [`Strange omens seen near ${event.location}.`]
  };
  const options = templates[event.type] ?? [`Something happened at ${event.location}.`];
  return rng.pick(options);
}
function processSocialShifts(event, world, rng) {
  const logs = [];
  const nearbyNpcs = world.npcs.filter((n) => n.location === event.location && n.alive !== false);
  if (nearbyNpcs.length < 2)
    return logs;
  for (let i = 0;i < nearbyNpcs.length; i++) {
    for (let j = 0;j < nearbyNpcs.length; j++) {
      if (i === j)
        continue;
      const npc1 = nearbyNpcs[i];
      const npc2 = nearbyNpcs[j];
      const traits1 = npc1.depth?.traits || [];
      const traits2 = npc2.depth?.traits || [];
      if (event.type === "raid" || event.type === "battle") {
        if (rng.chance(0.1)) {
          if (traits1.includes("brave") || traits1.includes("honorable")) {
            logs.push({
              category: "town",
              summary: `${npc2.name} is inspired by ${npc1.name}`,
              details: `Witnessing ${npc1.name}'s courage during the ${event.type}, ${npc2.name} feels a new bond of loyalty.`,
              location: event.location,
              actors: [npc1.name, npc2.name],
              worldTime: event.timestamp,
              realTime: new Date,
              seed: world.seed
            });
            if (rng.chance(0.2) && (traits2.includes("romantic") || traits2.includes("naive"))) {
              addNPCAgenda(npc2, {
                type: "romance",
                target: npc1.name,
                priority: 5,
                progress: 20,
                description: `Pursue a romantic bond with ${npc1.name} after the ${event.type}`
              });
            }
          }
          if (traits1.includes("treacherous") || traits1.includes("cowardly")) {
            if (rng.chance(0.1)) {
              addNPCAgenda(npc1, {
                type: "betrayal",
                target: npc2.name,
                priority: 6,
                progress: 10,
                description: `Exploit ${npc2.name}'s trust during the chaos`
              });
            }
          }
        }
      }
      if (event.type === "festival" || event.type === "miracle") {
        if (rng.chance(0.15)) {
          if (traits1.includes("romantic") || traits2.includes("romantic")) {
            addNPCAgenda(npc1, {
              type: "romance",
              target: npc2.name,
              priority: 4,
              progress: 10,
              description: `A connection formed during the ${event.type}`
            });
          }
        }
      }
    }
  }
  return logs;
}
function processDiscovery(event, world, rng) {
  const logs = [];
  const { item, type } = event.data;
  const nearestSettlement = world.settlements.find((s) => s.name === event.location);
  if (nearestSettlement) {
    const state = getSettlementState(world, nearestSettlement.name);
    state.prosperity += 1;
    for (const faction of world.factions) {
      if (rng.chance(0.2)) {
        logs.push({
          category: "faction",
          summary: `${faction.name} seeks the ${item}`,
          details: `News of the ${type} reaches the halls of ${faction.name}. They begin plotting to acquire it.`,
          location: event.location,
          actors: [faction.name],
          worldTime: event.timestamp,
          realTime: new Date,
          seed: world.seed
        });
      }
    }
  }
  return logs;
}
function getSettlementState(world, settlementName) {
  if (!world.settlementStates)
    world.settlementStates = {};
  if (!world.settlementStates[settlementName]) {
    world.settlementStates[settlementName] = {
      prosperity: 0,
      safety: 5,
      unrest: 0,
      populationDelta: 0,
      recentEvents: [],
      contested: false,
      defenseLevel: 3,
      quarantined: false
    };
  }
  return world.settlementStates[settlementName];
}
function getFactionState(world, factionId) {
  if (!world.factionStates)
    world.factionStates = {};
  if (!world.factionStates[factionId]) {
    world.factionStates[factionId] = {
      power: 50,
      territory: [],
      enemies: [],
      allies: [],
      resources: 100,
      morale: 0,
      resourceNeeds: [],
      casusBelli: {},
      activeOperations: [],
      recentLosses: 0,
      recentWins: 0
    };
  }
  return world.factionStates[factionId];
}
function getPartyState(world, partyId) {
  if (!world.partyStates)
    world.partyStates = {};
  if (!world.partyStates[partyId]) {
    world.partyStates[partyId] = {
      morale: 5,
      resources: 50,
      enemies: [],
      allies: [],
      questLog: [],
      killList: [],
      reputation: {}
    };
  }
  return world.partyStates[partyId];
}

// src/trade.ts
function getFactionName(world, factionId) {
  const faction = world.factions.find((f) => f.id === factionId);
  return faction?.name ?? factionId;
}
function advanceCaravans(world, rng, worldTime) {
  const logs = [];
  for (const caravan of world.caravans) {
    const [fromId, toId] = caravan.direction === "outbound" ? caravan.route : [caravan.route[1], caravan.route[0]];
    const from = settlementById(world, fromId);
    const to = settlementById(world, toId);
    if (!from || !to)
      continue;
    if (!caravan.escorts || caravan.escorts.length === 0) {
      const escort = chooseNPCEscort(world, rng);
      if (escort) {
        caravan.escorts = [escort.id];
      }
    }
    if (!caravan.merchantId) {
      const merch = chooseNPCMerchant(world, rng);
      if (merch) {
        caravan.merchantId = merch.id;
      }
    }
    const distance = distanceMiles(world, from.name, to.name) ?? 12;
    const terrain = pathTerrain(world, from.name, to.name);
    const mph = applyFatigueSpeed(distance / 24 * 0.75, 0);
    caravan.progressHours += 1;
    const milesCovered = caravan.progressHours * mph;
    if (milesCovered >= distance) {
      caravan.location = to.name;
      caravan.direction = caravan.direction === "outbound" ? "inbound" : "outbound";
      caravan.progressHours = 0;
      applyCaravanTrade(world, to.name, caravan.goods);
      if (caravan.factionId) {
        updateFactionWealth(world, caravan.factionId, 3);
        updateFactionAttitude(world, caravan.factionId, to.name, 1);
      }
      const escorts = caravan.escorts ? moveEscortsIntoTown(world, caravan.escorts, to.name) : [];
      const merchants = caravan.merchantId ? moveEscortsIntoTown(world, [caravan.merchantId], to.name) : [];
      const factionBanner = caravan.factionId ? getFactionName(world, caravan.factionId) : null;
      logs.push({
        category: "town",
        summary: `${caravan.name} arrives at ${to.name}`,
        details: `Bringing ${caravan.goods.join("/")} from ${from.name}${caravan.escorts?.length ? " with escorts" : ""}${factionBanner ? ` under banner of ${factionBanner}` : ""}.`,
        location: to.name,
        worldTime,
        realTime: new Date,
        seed: world.seed
      });
      logs.push(...npcArrivalLogs(escorts, to.name, worldTime, world.seed, world));
      logs.push(...npcArrivalLogs(merchants, to.name, worldTime, world.seed, world));
      if (caravan.factionId && rng.chance(0.4)) {
        const text = `Word spreads that ${caravan.name} of ${factionBanner} reached ${to.name} with ${caravan.goods.join("/")}.`;
        logs.push(factionRumorOnEvent(world, rng, to.name, caravan.factionId, text, worldTime));
      }
    } else if (rng.chance(0.02)) {
      const raider = rng.pick(world.factions.filter((f) => f.focus === "martial") || [{ name: "Bandits", id: "bandits" }]);
      const robberyEvent = {
        id: `robbery-${Date.now()}`,
        type: "robbery",
        timestamp: worldTime,
        location: caravan.location,
        actors: [raider.name],
        perpetrators: [raider.name],
        magnitude: 4,
        witnessed: true,
        data: {
          value: 50 + rng.int(100),
          targetType: "caravan",
          factionId: caravan.factionId,
          goods: caravan.goods
        }
      };
      logs.push({
        category: "road",
        summary: `${caravan.name} is raided!`,
        details: `${raider.name} forces have intercepted the caravan en route to ${to.name}.`,
        location: caravan.location,
        actors: [caravan.name, raider.name],
        worldTime,
        realTime: new Date,
        seed: world.seed
      });
      const causalityLogs = processWorldEvent(robberyEvent, world, rng, world.antagonists || [], world.storyThreads || []);
      logs.push(...causalityLogs);
      caravan.progressHours = Math.max(0, caravan.progressHours - 12);
    } else if (rng.chance(0.05)) {
      const escort = caravan.escorts?.length ? ` under escort` : "";
      logs.push({
        category: "road",
        summary: `${caravan.name} makes camp${escort}`,
        details: `Road to ${to.name} (${terrain}) quiet tonight.`,
        location: caravan.location,
        worldTime,
        realTime: new Date,
        seed: world.seed
      });
      if (caravan.factionId && rng.chance(0.1)) {
        updateFactionWealth(world, caravan.factionId, -2);
        updateFactionAttitude(world, caravan.factionId, to.name, -1);
        const lossedFactionName = caravan.factionId ? getFactionName(world, caravan.factionId) : "the caravan";
        if (caravan.escorts?.length && rng.chance(0.3)) {
          const wounded = moveEscortsIntoTown(world, caravan.escorts, caravan.location);
          for (const npc of wounded) {
            if (rng.chance(0.2)) {
              npc.alive = false;
              npc.wounded = true;
              logs.push({
                category: "road",
                summary: `${npc.name} falls defending the caravan`,
                details: `Loss shakes ${lossedFactionName}.`,
                location: caravan.location,
                worldTime,
                realTime: new Date,
                seed: world.seed
              });
            } else {
              npc.wounded = true;
              npc.fame = (npc.fame ?? 0) + 1;
            }
          }
          logs.push(...npcArrivalLogs(wounded.filter((n) => n.alive !== false), caravan.location, worldTime, world.seed, world));
        } else {
          logs.push({
            category: "road",
            summary: `${caravan.name} reports losses`,
            details: `Supplies spoiled en route; banners of ${lossedFactionName} tarnished.`,
            location: caravan.location,
            worldTime,
            realTime: new Date,
            seed: world.seed
          });
        }
        const text = `${caravan.name} of ${lossedFactionName} lost goods on the road; prices may shift.`;
        logs.push(factionRumorOnEvent(world, rng, caravan.location, caravan.factionId, text, worldTime));
      }
    }
  }
  return logs;
}

// src/prose.ts
function getTimeOfDayPhase(hour) {
  if (hour >= 5 && hour < 7)
    return "dawn";
  if (hour >= 7 && hour < 11)
    return "morning";
  if (hour >= 11 && hour < 14)
    return "midday";
  if (hour >= 14 && hour < 17)
    return "afternoon";
  if (hour >= 17 && hour < 20)
    return "dusk";
  if (hour >= 20 && hour < 23)
    return "evening";
  if (hour >= 23 || hour < 2)
    return "night";
  return "deep-night";
}
var TIME_DESCRIPTORS = {
  dawn: [
    "as rose light crept across the land",
    "with the first cock-crow",
    "as mist still clung to low places",
    "while dew pearled on grass and stone",
    "as the world stirred from slumber"
  ],
  morning: [
    "under a brightening sky",
    "as folk went about their labors",
    "with the sun climbing steadily",
    "amid the bustle of morning trade",
    "as smoke rose from breakfast fires"
  ],
  midday: [
    "under the high sun",
    "as shadows pooled beneath eaves",
    "in the drowsy heat of noon",
    "while sensible folk sought shade",
    "as the bell tolled the sixth hour"
  ],
  afternoon: [
    "as the day wore on",
    "with lengthening shadows",
    "in the golden afternoon light",
    "as travelers grew road-weary",
    "while the sun began its descent"
  ],
  dusk: [
    "as purple shadows gathered",
    "with the setting of the sun",
    "as lanterns were kindled",
    "in the gloaming hour",
    "as bats took wing"
  ],
  evening: [
    "by candlelight and hearth-glow",
    "as the stars emerged one by one",
    "with ale flowing in taprooms",
    "as songs rose from dim taverns",
    "under an indigo sky"
  ],
  night: [
    "under a canopy of stars",
    "as owls hunted in darkness",
    "with only moonlight for company",
    "in the hush of late night",
    "while decent folk lay sleeping"
  ],
  "deep-night": [
    "in the witching hour",
    "as even the taverns fell silent",
    "when shadows grew deepest",
    "in the cold hours before dawn",
    "as the world held its breath"
  ]
};
var TERRAIN_ATMOSPHERE = {
  road: {
    sights: [
      "wagon ruts worn deep into the earth",
      "a milestone marking leagues to the capital",
      "a wayside shrine with fresh offerings",
      "dust rising from distant hooves",
      "a peddler's cart overturned by the verge"
    ],
    sounds: [
      "the creak of wagon wheels",
      "distant hoofbeats",
      "a tinker's bell",
      "the song of road-weary pilgrims",
      "ravens arguing over carrion"
    ],
    smells: [
      "road dust and horse sweat",
      "wildflowers along the verge",
      "smoke from a roadside camp",
      "the tang of iron from a smithy"
    ],
    hazards: [
      "a suspicious band loitering at the crossroads",
      "signs of recent violence: bloodstains, abandoned goods",
      "a broken bridge forcing a detour"
    ]
  },
  clear: {
    sights: [
      "golden wheat swaying in the breeze",
      "a shepherd minding distant flocks",
      "ancient standing stones on a hilltop",
      "a lone oak spreading its branches wide",
      "farmsteads dotting the gentle hills"
    ],
    sounds: [
      "skylarks singing overhead",
      "the rustle of tall grass",
      "cattle lowing in distant fields",
      "wind sighing through grain"
    ],
    smells: [
      "fresh-turned earth",
      "hay and clover",
      "the sweetness of ripening apples",
      "wood smoke from a cottage chimney"
    ],
    hazards: [
      "tracks of some large beast in the soft earth",
      "a burned farmstead, still smoldering",
      "circling crows marking something dead"
    ]
  },
  forest: {
    sights: [
      "ancient oaks draped in moss",
      "shafts of light piercing the canopy",
      "a clearing where standing stones lurked",
      "fungus growing in strange patterns",
      "a ruined tower choked by vines"
    ],
    sounds: [
      "branches creaking overhead",
      "unseen things rustling in undergrowth",
      "the tap of a woodpecker",
      "an eerie silence where birdsong ceased",
      "distant howling at dusk"
    ],
    smells: [
      "leaf mold and decay",
      "pine resin sharp and clean",
      "the musk of some passing beast",
      "rotting wood and toadstools"
    ],
    hazards: [
      "webs strung between trees, too large for ordinary spiders",
      "claw marks on bark, head-height or higher",
      "bones scattered near a dark hollow"
    ]
  },
  hills: {
    sights: [
      "cairns marking ancient graves",
      "the mouth of a cave, dark and inviting",
      "a ruined watchtower on the heights",
      "goats picking their way along cliffs",
      "mist pooling in the valleys below"
    ],
    sounds: [
      "wind keening through rocky passes",
      "the clatter of loose stones",
      "a distant rockslide",
      "the scream of a hunting hawk"
    ],
    smells: [
      "heather and wild thyme",
      "mineral tang from exposed rock",
      "the cold scent of coming rain"
    ],
    hazards: [
      "a rope bridge in poor repair",
      "fresh rockfall blocking the path",
      "smoke rising from caves—someone, or something, dwells within"
    ]
  },
  mountains: {
    sights: [
      "snow-capped peaks gleaming in sunlight",
      "a glacier grinding slowly downward",
      "the ruins of a dwarven gatehouse",
      "a frozen waterfall",
      "vast chasms with no visible bottom"
    ],
    sounds: [
      "the groan of shifting ice",
      "thunder echoing between peaks",
      "the shriek of mountain winds",
      "ominous silence after an avalanche"
    ],
    smells: [
      "thin cold air",
      "sulfur from hot springs",
      "the iron tang of altitude"
    ],
    hazards: [
      "unstable ice over deep crevasses",
      "giant footprints in the snow",
      "a cave mouth breathing warm, fetid air"
    ]
  },
  swamp: {
    sights: [
      "will-o-wisps dancing over dark water",
      "a drowned village, rooftops jutting above the murk",
      "twisted trees rising from fog",
      "bubbles rising from the deep",
      "a heron standing motionless, watching"
    ],
    sounds: [
      "the croak of countless frogs",
      "something heavy sliding into water",
      "the buzz of biting flies",
      "sucking mud reluctant to release boots"
    ],
    smells: [
      "rot and stagnant water",
      "the sweetness of decay",
      "methane rising from the depths"
    ],
    hazards: [
      "quicksand lurking beneath innocent-looking moss",
      "humanoid tracks leading into the mire—none returning",
      "a half-sunken boat, owner unknown"
    ]
  },
  desert: {
    sights: [
      "bleached bones half-buried in sand",
      "mirages shimmering on the horizon",
      "a ruined city of sandstone pillars",
      "an oasis ringed with palms",
      "vultures circling lazily overhead"
    ],
    sounds: [
      "the hiss of sand in the wind",
      "the scuttle of scorpions",
      "thunder of a distant sandstorm",
      "the cry of a desert hawk"
    ],
    smells: [
      "dry heat and dust",
      "the rare sweetness of date palms",
      "the musk of passing camels"
    ],
    hazards: [
      "signs of a sandstorm on the horizon",
      "a dried corpse clutching an empty waterskin",
      "strange geometric carvings in exposed bedrock"
    ]
  }
};
var SETTLEMENT_VIBES = {
  village: {
    bustle: [
      "chickens scattered before approaching travelers",
      "the blacksmith's hammer rang out steadily",
      "children chased each other through muddy lanes",
      "farmers argued over the price of grain"
    ],
    tension: [
      "doors were barred and shutters drawn",
      "watchmen eyed strangers with open suspicion",
      "whispered conversations fell silent at approach",
      "a gibbet creaked in the village square"
    ],
    peace: [
      "old men dozed on benches in the sun",
      "the smell of baking bread drifted from open doors",
      "a wedding party spilled laughing from the chapel",
      "children gathered to hear a pedlar's tales"
    ]
  },
  town: {
    bustle: [
      "merchants hawked wares in crowded market squares",
      "guild banners snapped in the breeze",
      "a crier announced the day's proclamations",
      "the town watch marched in ordered formation"
    ],
    tension: [
      "tavern brawls spilled into the streets",
      "tax collectors moved under armed guard",
      "gallows stood freshly constructed in the square",
      "rumors of plague set folk on edge"
    ],
    peace: [
      "fountain water sparkled in the afternoon sun",
      "minstrels played in the garden of the Merchant's Guild",
      "the cathedral bells marked the peaceful hours",
      "street performers drew laughing crowds"
    ]
  },
  city: {
    bustle: [
      "the roar of ten thousand souls going about their business",
      "carriages rattled over cobblestones",
      "exotic spices scented the market district",
      "foreign tongues mingled in the harbor quarter"
    ],
    tension: [
      "the city watch patrolled in force after dark",
      "a noble's retinue swept commoners from the path",
      "the executioner's block saw fresh use",
      "plague doctors stalked the poorer quarters"
    ],
    peace: [
      "great temples rose in marble splendor",
      "scholars debated in university cloisters",
      "a grand festival filled the streets with color",
      "the duke's gardens opened to public promenade"
    ]
  }
};
function atmosphericOpening(rng, worldTime, terrain, mood) {
  const hour = worldTime.getUTCHours();
  const phase = getTimeOfDayPhase(hour);
  const timeDesc = rng.pick(TIME_DESCRIPTORS[phase]);
  const atmos = TERRAIN_ATMOSPHERE[terrain];
  const elements = [];
  if (rng.chance(0.6))
    elements.push(rng.pick(atmos.sights));
  if (rng.chance(0.4))
    elements.push(rng.pick(atmos.sounds));
  if (rng.chance(0.25))
    elements.push(rng.pick(atmos.smells) + " hung in the air");
  if (mood === "ominous" && rng.chance(0.5))
    elements.push(rng.pick(atmos.hazards));
  const detail = elements.length ? ` ${rng.pick(elements)}.` : "";
  return `${capitalize(timeDesc)}${detail}`;
}
function settlementScene(rng, settlement, worldTime, tension) {
  const vibes = SETTLEMENT_VIBES[settlement.type];
  const normalizedTension = tension ?? settlement.mood;
  let flavorPool;
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
function encounterFlavorText(rng, foe, reaction2, outcome, terrain, actors) {
  const party = actors[0] ?? "The company";
  const atmos = TERRAIN_ATMOSPHERE[terrain];
  const FRIENDLY_SUMMARIES = [
    `${party} share a fire with wandering ${foe}`,
    `${party} trade news with passing ${foe}`,
    `${party} and ${foe} find common cause`,
    `${foe} offer ${party} aid on the road`
  ];
  const CAUTIOUS_SUMMARIES = [
    `${party} observe ${foe} from a distance`,
    `${party} skirt around wary ${foe}`,
    `${foe} shadow ${party} but keep their distance`,
    `Tense standoff between ${party} and ${foe}`
  ];
  const HOSTILE_SUMMARIES = [
    `${party} clash with ${foe}`,
    `${foe} ambush ${party}`,
    `Battle joined between ${party} and ${foe}`,
    `${party} face ${foe} in deadly combat`
  ];
  const VICTORY_DETAILS = [
    "Steel rang and blood was spilled, but they prevailed.",
    "The fight was brief and brutal. The survivors withdrew.",
    "With discipline and fury, the foe was broken.",
    "Blades flashed in the uncertain light. When it ended, the way was clear.",
    "Though wounds were taken, the day was won."
  ];
  const DEFEAT_DETAILS = [
    "They were driven back, leaving the field to their enemies.",
    "A bitter retreat, carrying wounded through the darkness.",
    "The rout was complete. They would not soon forget this day.",
    "Blood and humiliation marked the aftermath."
  ];
  const NEGOTIATION_DETAILS = [
    "Words proved mightier than steel on this occasion.",
    "Coin changed hands. Honor was satisfied, barely.",
    "An uneasy bargain was struck beneath wary eyes.",
    "Neither side wished to die today. Terms were agreed."
  ];
  const FLIGHT_DETAILS = [
    "They ran. There was no shame in it—only survival.",
    "Discretion proved the better part of valor.",
    "A fighting withdrawal, but a withdrawal nonetheless.",
    "Sometimes wisdom is knowing when to flee."
  ];
  let summary;
  let detailPool;
  switch (reaction2) {
    case "friendly":
      summary = rng.pick(FRIENDLY_SUMMARIES);
      detailPool = NEGOTIATION_DETAILS;
      break;
    case "cautious":
      summary = rng.pick(CAUTIOUS_SUMMARIES);
      detailPool = outcome === "flight" ? FLIGHT_DETAILS : NEGOTIATION_DETAILS;
      break;
    case "hostile":
    default:
      summary = rng.pick(HOSTILE_SUMMARIES);
      detailPool = outcome === "victory" ? VICTORY_DETAILS : outcome === "defeat" ? DEFEAT_DETAILS : outcome === "flight" ? FLIGHT_DETAILS : NEGOTIATION_DETAILS;
  }
  let details = rng.pick(detailPool);
  if (rng.chance(0.3)) {
    details += ` ${capitalize(rng.pick(atmos.sights))} marked the scene.`;
  }
  return { summary, details };
}
function marketBeat(rng, settlement, worldTime, notable) {
  if (!notable?.npcs?.length && !notable?.parties?.length && rng.chance(0.7)) {
    return null;
  }
  const hour = worldTime.getUTCHours();
  const phase = getTimeOfDayPhase(hour);
  if (phase === "night" || phase === "deep-night")
    return null;
  const vibes = SETTLEMENT_VIBES[settlement.type];
  const tension = notable?.tension ?? settlement.mood;
  const MARKET_SUMMARIES = {
    low_tension: [
      `Fair weather and fair dealing in ${settlement.name}`,
      `${settlement.name} enjoys prosperous trade`,
      `Peace reigns in the markets of ${settlement.name}`
    ],
    normal: [
      `Commerce flows through ${settlement.name}`,
      `The usual business in ${settlement.name}`,
      `${settlement.name} sees steady trade`
    ],
    high_tension: [
      `Unrest simmers in ${settlement.name}`,
      `Tensions run high in ${settlement.name}'s streets`,
      `Trouble brewing in ${settlement.name}`
    ]
  };
  const tensionKey = tension >= 2 ? "high_tension" : tension <= -2 ? "low_tension" : "normal";
  let summary = rng.pick(MARKET_SUMMARIES[tensionKey]);
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
function weatherNarrative(rng, settlement, conditions, worldTime) {
  const WEATHER_NARRATIVES = {
    clear: {
      summaries: [
        `Blue skies over ${settlement.name}`,
        `Fair weather blesses ${settlement.name}`,
        `The sun shines upon ${settlement.name}`
      ],
      details: [
        "Perfect conditions for travel and trade.",
        "Not a cloud marred the heavens.",
        "Farmers gave thanks for the gentle weather."
      ]
    },
    cloudy: {
      summaries: [
        `Clouds gather over ${settlement.name}`,
        `Grey skies hang over ${settlement.name}`,
        `Overcast weather at ${settlement.name}`
      ],
      details: [
        "Whether rain would follow, none could say.",
        "The mood matched the dull sky.",
        "Old wounds ached with the change in pressure."
      ]
    },
    rain: {
      summaries: [
        `Rain falls on ${settlement.name}`,
        `${settlement.name} weathers a downpour`,
        `The heavens open over ${settlement.name}`
      ],
      details: [
        "The streets emptied as folk sought shelter.",
        "Merchants cursed as goods needed covering.",
        "Children splashed in growing puddles."
      ]
    },
    storm: {
      summaries: [
        `Storm lashes ${settlement.name}`,
        `Thunder rolls over ${settlement.name}`,
        `Tempest strikes ${settlement.name}`
      ],
      details: [
        "Shutters slammed and animals huddled in barns.",
        "Lightning illuminated the darkened streets.",
        "The old folk said such storms brought change."
      ]
    },
    snow: {
      summaries: [
        `Snow blankets ${settlement.name}`,
        `Winter's grip tightens on ${settlement.name}`,
        `${settlement.name} wakes to fresh snowfall`
      ],
      details: [
        "Sounds were muffled under the white covering.",
        "The cold drove all but the hardiest indoors.",
        "Children made sport while adults worried over firewood."
      ]
    },
    fog: {
      summaries: [
        `Fog shrouds ${settlement.name}`,
        `Mist rolls through ${settlement.name}`,
        `${settlement.name} vanishes into fog`
      ],
      details: [
        "Shapes loomed and vanished in the murk.",
        "Sound carried strangely in the thick air.",
        "The watch doubled their patrols, seeing danger in every shadow."
      ]
    }
  };
  const weather = WEATHER_NARRATIVES[conditions];
  return {
    summary: rng.pick(weather.summaries),
    details: rng.pick(weather.details)
  };
}
function capitalize(s) {
  if (!s)
    return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// src/calendar.ts
var MONTHS = [
  { name: "Deepwinter", season: "winter", days: 30 },
  { name: "Thawmoon", season: "winter", days: 30 },
  { name: "Sowingtime", season: "spring", days: 31 },
  { name: "Rainmoon", season: "spring", days: 30 },
  { name: "Brightening", season: "spring", days: 31 },
  { name: "Highsun", season: "summer", days: 30 },
  { name: "Summerpeak", season: "summer", days: 31 },
  { name: "Harvestide", season: "autumn", days: 30 },
  { name: "Leaffall", season: "autumn", days: 31 },
  { name: "Mistmoon", season: "autumn", days: 30 },
  { name: "Frostfall", season: "winter", days: 30 },
  { name: "Longnight", season: "winter", days: 31 }
];
var FESTIVALS = [
  {
    name: "Candlemas",
    month: 1,
    dayStart: 15,
    duration: 1,
    description: "Candles are lit against the dark; folk pray for the return of light.",
    effects: { moodBonus: 1 }
  },
  {
    name: "First Planting",
    month: 2,
    dayStart: 1,
    duration: 3,
    description: "Seeds are blessed and the first furrows cut. A time of hope.",
    effects: { moodBonus: 1, dangerReduction: true }
  },
  {
    name: "Beltane",
    month: 4,
    dayStart: 1,
    duration: 2,
    description: "Great fires are lit. Young lovers dance. The veil thins.",
    effects: { moodBonus: 2, magicPotent: true }
  },
  {
    name: "Midsummer",
    month: 5,
    dayStart: 21,
    duration: 3,
    description: "The longest day. Grand markets, tournaments, and revelry.",
    effects: { moodBonus: 2, tradeBonus: true }
  },
  {
    name: "Harvest Home",
    month: 7,
    dayStart: 20,
    duration: 5,
    description: "The crops are in. Feasting, drinking, and thanksgiving.",
    effects: { moodBonus: 2, tradeBonus: true }
  },
  {
    name: "Allhallows",
    month: 9,
    dayStart: 31,
    duration: 1,
    description: "The dead walk close. Masks are worn. Wards are strengthened.",
    effects: { magicPotent: true }
  },
  {
    name: "Winternight",
    month: 11,
    dayStart: 21,
    duration: 3,
    description: "The longest night. Gifts are exchanged. Oaths renewed.",
    effects: { moodBonus: 1 }
  }
];
function getCalendarFromDate(date, weather) {
  const baseYear = 1000;
  const msPerDay = 24 * 60 * 60 * 1000;
  const daysSinceEpoch = Math.floor(date.getTime() / msPerDay);
  const daysPerYear = MONTHS.reduce((sum, m) => sum + m.days, 0);
  const year = baseYear + Math.floor(daysSinceEpoch / daysPerYear);
  let dayOfYear = daysSinceEpoch % daysPerYear;
  let month = 0;
  let day = 1;
  for (let m = 0;m < MONTHS.length; m++) {
    if (dayOfYear < MONTHS[m].days) {
      month = m;
      day = dayOfYear + 1;
      break;
    }
    dayOfYear -= MONTHS[m].days;
  }
  const moonCycleDay = daysSinceEpoch % 30;
  let moonPhase;
  if (moonCycleDay < 7)
    moonPhase = "new";
  else if (moonCycleDay < 15)
    moonPhase = "waxing";
  else if (moonCycleDay < 22)
    moonPhase = "full";
  else
    moonPhase = "waning";
  return {
    year,
    month,
    day,
    weather: weather ?? "clear",
    weatherDuration: 12,
    moonPhase,
    activeEffects: {}
  };
}
function getSeason(month) {
  return MONTHS[month % 12].season;
}
function getMonthName(month) {
  return MONTHS[month % 12].name;
}
function formatDate(calendar) {
  const monthName = getMonthName(calendar.month);
  const ordinal = getOrdinal(calendar.day);
  return `${calendar.day}${ordinal} of ${monthName}, Year ${calendar.year}`;
}
function getOrdinal(n) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}
function getActiveFestival(calendar) {
  for (const festival of FESTIVALS) {
    if (calendar.month !== festival.month)
      continue;
    if (calendar.day >= festival.dayStart && calendar.day < festival.dayStart + festival.duration) {
      return festival;
    }
  }
  return;
}
var WEATHER_ODDS = {
  spring: { clear: 0.3, cloudy: 0.25, rain: 0.3, storm: 0.1, snow: 0.02, fog: 0.08 },
  summer: { clear: 0.5, cloudy: 0.2, rain: 0.15, storm: 0.1, snow: 0, fog: 0.05 },
  autumn: { clear: 0.25, cloudy: 0.3, rain: 0.25, storm: 0.05, snow: 0.05, fog: 0.15 },
  winter: { clear: 0.2, cloudy: 0.25, rain: 0.1, storm: 0.05, snow: 0.3, fog: 0.1 }
};
function generateWeather(rng, season, previousWeather) {
  const odds = WEATHER_ODDS[season];
  if (previousWeather && rng.chance(0.6)) {
    return previousWeather;
  }
  const roll = rng.next();
  let cumulative = 0;
  for (const [condition, prob] of Object.entries(odds)) {
    cumulative += prob;
    if (roll < cumulative) {
      return condition;
    }
  }
  return "clear";
}
function getWeatherEffects(weather) {
  switch (weather) {
    case "clear":
      return {
        travelSpeedMod: 1,
        encounterChanceMod: 1,
        visibilityReduced: false,
        outdoorActivityPenalty: false,
        descriptiveCondition: "fine weather",
        moodModifier: 1,
        combatModifier: 0,
        magicModifier: 0,
        narrativeHooks: [
          "Perfect weather for a journey",
          "The gods smile upon travelers",
          "A beautiful day for commerce"
        ]
      };
    case "cloudy":
      return {
        travelSpeedMod: 1,
        encounterChanceMod: 1,
        visibilityReduced: false,
        outdoorActivityPenalty: false,
        descriptiveCondition: "overcast skies",
        moodModifier: 0,
        combatModifier: 0,
        magicModifier: 0,
        narrativeHooks: [
          "An oppressive sky weighs on spirits",
          "The gray light hides intentions",
          "Change comes with the clouds"
        ]
      };
    case "rain":
      return {
        travelSpeedMod: 0.75,
        encounterChanceMod: 0.8,
        visibilityReduced: true,
        outdoorActivityPenalty: true,
        descriptiveCondition: "steady rain",
        moodModifier: -1,
        combatModifier: -1,
        magicModifier: 1,
        narrativeHooks: [
          "Rain drives folk indoors—and secrets outdoors",
          "Footprints wash away quickly",
          "The rivers rise",
          "Crops drink deep"
        ]
      };
    case "storm":
      return {
        travelSpeedMod: 0.5,
        encounterChanceMod: 0.5,
        visibilityReduced: true,
        outdoorActivityPenalty: true,
        descriptiveCondition: "raging storm",
        moodModifier: -2,
        combatModifier: -2,
        magicModifier: 2,
        narrativeHooks: [
          "The storm covers all sounds",
          "Lightning illuminates hidden truths",
          "Only the desperate or the mad travel now",
          "Something stirs in the thunder",
          "The old gods speak in the wind"
        ]
      };
    case "snow":
      return {
        travelSpeedMod: 0.6,
        encounterChanceMod: 0.7,
        visibilityReduced: true,
        outdoorActivityPenalty: true,
        descriptiveCondition: "falling snow",
        moodModifier: 0,
        combatModifier: -1,
        magicModifier: 1,
        narrativeHooks: [
          "Tracks show clearly in fresh snow",
          "The cold claims the unwary",
          "Beauty and danger in equal measure",
          "Supplies become precious",
          "Fire is life"
        ]
      };
    case "fog":
      return {
        travelSpeedMod: 0.8,
        encounterChanceMod: 1.2,
        visibilityReduced: true,
        outdoorActivityPenalty: false,
        descriptiveCondition: "thick fog",
        moodModifier: -1,
        combatModifier: 0,
        magicModifier: 1,
        narrativeHooks: [
          "The fog hides friend and foe alike",
          "Sounds carry strangely",
          "The veil between worlds thins",
          "Ghosts walk more freely",
          "Perfect weather for secrets"
        ]
      };
  }
}
function getSeasonalEffects(season) {
  switch (season) {
    case "spring":
      return {
        travelMod: 1,
        encounterMod: 1.1,
        economicMod: 0.9,
        moodMod: 1,
        agricultureMod: 1.5,
        militaryMod: 0.8,
        narrativeHooks: [
          "New life stirs in the land",
          "The thaw reveals what winter hid",
          "Young animals are vulnerable",
          "Rivers run high with snowmelt",
          "Romance blooms with the flowers"
        ],
        monsters: ["wolves", "bears", "goblins", "bandits"],
        events: ["flooding", "migration", "romance", "planting-festival", "disease-outbreak"]
      };
    case "summer":
      return {
        travelMod: 1.1,
        encounterMod: 1,
        economicMod: 1.1,
        moodMod: 1,
        agricultureMod: 1.2,
        militaryMod: 1.2,
        narrativeHooks: [
          "The long days favor the bold",
          "Armies march while the roads are dry",
          "Travelers fill the roads",
          "The heat breeds tempers",
          "Droughts threaten the harvest"
        ],
        monsters: ["dragons", "giants", "orcs", "trolls"],
        events: ["war", "tournament", "drought", "plague", "trade-fair"]
      };
    case "autumn":
      return {
        travelMod: 1,
        encounterMod: 1.2,
        economicMod: 1.3,
        moodMod: 0,
        agricultureMod: 2,
        militaryMod: 1,
        narrativeHooks: [
          "The harvest will determine who survives winter",
          "Creatures grow desperate before the cold",
          "The veil between worlds thins",
          "Old things stir in the dying light",
          "Debts come due before winter"
        ],
        monsters: ["undead", "werewolves", "demons", "fey"],
        events: ["harvest", "haunting", "succession", "wedding", "famine"]
      };
    case "winter":
      return {
        travelMod: 0.7,
        encounterMod: 0.6,
        economicMod: 0.7,
        moodMod: -1,
        agricultureMod: 0,
        militaryMod: 0.5,
        narrativeHooks: [
          "The cold is a patient killer",
          "Communities huddle together",
          "Old rivalries simmer by the fire",
          "The desperate take desperate measures",
          "Ice locks the roads",
          "Hunger gnaws at the edges"
        ],
        monsters: ["frost-giants", "ice-trolls", "yeti", "white-dragons", "wolves"],
        events: ["starvation", "siege", "murder", "conspiracy", "fire"]
      };
  }
}
function generateSeasonalEvent(rng, season, settlement, worldTime, seed) {
  const effects = getSeasonalEffects(season);
  if (!rng.chance(0.05))
    return null;
  const SEASONAL_EVENTS = {
    spring: {
      summaries: [
        `Spring floods threaten ${settlement.name}`,
        `Young lovers elope from ${settlement.name}`,
        `The first caravans of spring reach ${settlement.name}`,
        `Planting begins in earnest near ${settlement.name}`,
        `Wildlife returns to the fields around ${settlement.name}`
      ],
      details: [
        "The rivers run high. Cellars flood. Roads turn to mud.",
        "Families rage, but the heart wants what it wants.",
        "Fresh goods and fresher news arrive after the long winter.",
        "The earth is turned. Seeds are blessed. Hope is planted.",
        "Birds return. Deer are spotted. The hunters sharpen their bows."
      ]
    },
    summer: {
      summaries: [
        `Heat wave grips ${settlement.name}`,
        `Travelers crowd the roads near ${settlement.name}`,
        `A great tournament is announced in ${settlement.name}`,
        `Drought threatens crops around ${settlement.name}`,
        `Tempers flare in ${settlement.name}'s markets`
      ],
      details: [
        "Wells run low. Folk sleep outdoors. Work halts in the hottest hours.",
        "The roads are thick with pilgrims, merchants, and less savory types.",
        "Knights and champions gather. Glory awaits. So do broken bones.",
        "The sun beats down without mercy. Prayers for rain go unanswered.",
        "A fistfight breaks out. Old grudges surface in the heat."
      ]
    },
    autumn: {
      summaries: [
        `The harvest begins in ${settlement.name}`,
        `Ghosts are sighted near ${settlement.name}`,
        `A cold snap catches ${settlement.name} off guard`,
        `Animals gather stores before winter near ${settlement.name}`,
        `The veil thins around ${settlement.name}`
      ],
      details: [
        "All hands work the fields. The size of the harvest will determine the winter.",
        "The dead do not rest easy as the nights grow long.",
        "Frost comes early. Crops are damaged. Worry sets in.",
        "Bears grow bold. Wolves range far. The wise stay indoors after dark.",
        "Dreams grow strange. Omens multiply. The priests are busy."
      ]
    },
    winter: {
      summaries: [
        `A blizzard blankets ${settlement.name}`,
        `Supplies run low in ${settlement.name}`,
        `Cabin fever grips ${settlement.name}`,
        `A fire breaks out in ${settlement.name}`,
        `The frozen roads isolate ${settlement.name}`
      ],
      details: [
        "Snow piles high. Travel is impossible. The world shrinks to four walls.",
        "Rations are cut. The granaries are watched. Theft becomes tempting.",
        "Trapped together, old tensions boil over. A fight erupts.",
        "In the dry winter air, flames spread fast. Buckets form a chain.",
        "No word in or out. What happens in the settlement, stays there."
      ]
    }
  };
  const events = SEASONAL_EVENTS[season];
  const index = rng.int(events.summaries.length);
  return {
    category: "weather",
    summary: events.summaries[index],
    details: events.details[index],
    location: settlement.name,
    worldTime,
    realTime: new Date,
    seed
  };
}
function festivalEvent(rng, settlement, festival, worldTime, seed) {
  const FESTIVAL_SCENES = [
    `${festival.name} transforms ${settlement.name}`,
    `${settlement.name} celebrates ${festival.name}`,
    `The spirit of ${festival.name} fills ${settlement.name}`
  ];
  const CELEBRATION_DETAILS = [
    "Bonfires blaze in the squares, and music fills the night.",
    "Merchants offer festival prices; the air smells of roasting meat.",
    "Children in costume run through the streets, chased by laughter.",
    "The temples are full. The taverns are fuller.",
    "Old grudges are set aside, at least until the morrow.",
    "Travelers are welcomed with unusual warmth."
  ];
  return {
    category: "town",
    summary: rng.pick(FESTIVAL_SCENES),
    details: `${festival.description} ${rng.pick(CELEBRATION_DETAILS)}`,
    location: settlement.name,
    worldTime,
    realTime: new Date,
    seed
  };
}
function dailyCalendarTick(world, rng, worldTime, currentCalendar) {
  const logs = [];
  let { year, month, day } = currentCalendar;
  day += 1;
  if (day > MONTHS[month].days) {
    day = 1;
    month += 1;
    if (month >= 12) {
      month = 0;
      year += 1;
      logs.push({
        category: "town",
        summary: `The new year dawns: Year ${year}`,
        details: "Church bells ring across the land. A fresh page turns in the chronicle.",
        worldTime,
        realTime: new Date,
        seed: world.seed
      });
    }
    logs.push({
      category: "town",
      summary: `The month of ${getMonthName(month)} begins`,
      details: `${capitalize(getSeason(month))} ${month < 6 ? "strengthens its grip" : "settles over the land"}.`,
      worldTime,
      realTime: new Date,
      seed: world.seed
    });
  }
  const season = getSeason(month);
  const newWeather = generateWeather(rng, season, currentCalendar.weather);
  if (newWeather !== currentCalendar.weather) {
    const settlement = rng.pick(world.settlements);
    const narrative = weatherNarrative(rng, settlement, newWeather, worldTime);
    logs.push({
      category: "weather",
      summary: narrative.summary,
      details: narrative.details,
      location: settlement.name,
      worldTime,
      realTime: new Date,
      seed: world.seed
    });
  }
  const newCalendar = getCalendarFromDate(worldTime, newWeather);
  newCalendar.weather = newWeather;
  const festival = getActiveFestival(newCalendar);
  if (festival) {
    newCalendar.activeEffects.festival = festival;
    if (day === festival.dayStart) {
      for (const settlement of world.settlements) {
        logs.push(festivalEvent(rng, settlement, festival, worldTime, world.seed));
        if (festival.effects.moodBonus) {
          settlement.mood = Math.min(3, settlement.mood + festival.effects.moodBonus);
        }
      }
    }
  }
  if (newCalendar.moonPhase === "full" && currentCalendar.moonPhase !== "full") {
    logs.push({
      category: "weather",
      summary: "The full moon rises",
      details: "Silver light bathes the land. Strange things stir in the shadows.",
      worldTime,
      realTime: new Date,
      seed: world.seed
    });
    newCalendar.activeEffects.omens = ["Werewolves hunt", "Ghosts walk", "The fey are restless"];
  }
  if (rng.chance(0.002)) {
    const RARE_EVENTS = [
      { summary: "Eclipse darkens the sky", details: "For long minutes, day becomes night. Animals panic. Priests pray." },
      { summary: "A comet blazes overhead", details: "Seers proclaim doom. Others see opportunity. All agree: change is coming." },
      { summary: "Aurora lights the northern sky", details: "Rivers of color flow across the heavens. The old folk speak of portents." },
      { summary: "The earth trembles", details: "A quake rattles buildings and nerves alike. Some walls crack; some secrets are exposed." }
    ];
    const event = rng.pick(RARE_EVENTS);
    logs.push({
      category: "weather",
      summary: event.summary,
      details: event.details,
      worldTime,
      realTime: new Date,
      seed: world.seed
    });
  }
  for (const settlement of world.settlements) {
    const seasonalEvent = generateSeasonalEvent(rng, season, settlement, worldTime, world.seed);
    if (seasonalEvent) {
      logs.push(seasonalEvent);
      const seasonEffects = getSeasonalEffects(season);
      const weatherEffects = getWeatherEffects(newWeather);
      settlement.mood = Math.max(-3, Math.min(3, settlement.mood + seasonEffects.moodMod * 0.1 + weatherEffects.moodModifier * 0.1));
    }
  }
  if (newWeather === "storm" && rng.chance(0.1)) {
    const settlement = rng.pick(world.settlements);
    const STORM_DAMAGE = [
      {
        summary: `Lightning strikes ${settlement.name}`,
        details: "A building catches fire. The bucket brigade forms."
      },
      {
        summary: `Flooding in ${settlement.name}`,
        details: "The river overflows its banks. Lower districts evacuate."
      },
      {
        summary: `Roof collapse in ${settlement.name}`,
        details: "The wind proves too much for an old structure. Fortunately, no deaths."
      },
      {
        summary: `Tree falls on ${settlement.name} road`,
        details: "The main thoroughfare is blocked. Traffic reroutes through cramped alleys."
      }
    ];
    const damage = rng.pick(STORM_DAMAGE);
    logs.push({
      category: "weather",
      summary: damage.summary,
      details: damage.details,
      location: settlement.name,
      worldTime,
      realTime: new Date,
      seed: world.seed
    });
    settlement.mood = Math.max(-3, settlement.mood - 1);
  }
  if (newWeather === "snow" && season === "winter" && rng.chance(0.05)) {
    const settlement = rng.pick(world.settlements);
    logs.push({
      category: "weather",
      summary: `Heavy snow isolates ${settlement.name}`,
      details: "The roads are impassable. The settlement must rely on its own stores.",
      location: settlement.name,
      worldTime,
      realTime: new Date,
      seed: world.seed
    });
  }
  if (newWeather === "fog" && rng.chance(0.08)) {
    const settlement = rng.pick(world.settlements);
    const FOG_EVENTS = [
      {
        summary: `Robbery in ${settlement.name} under cover of fog`,
        details: "The thieves vanished into the murk before anyone could react."
      },
      {
        summary: `Body discovered in ${settlement.name} fog`,
        details: "The victim was not killed by the weather. The watch investigates."
      },
      {
        summary: `Smugglers slip through ${settlement.name}`,
        details: "Contraband moves freely when no one can see."
      }
    ];
    const fogEvent = rng.pick(FOG_EVENTS);
    logs.push({
      category: "town",
      summary: fogEvent.summary,
      details: fogEvent.details,
      location: settlement.name,
      worldTime,
      realTime: new Date,
      seed: world.seed
    });
  }
  const prevSeason = getSeason((month - 1 + 12) % 12);
  if (day === 1 && season !== prevSeason) {
    logs.push({
      category: "weather",
      summary: `${capitalize(season)} arrives`,
      details: getSeasonTransitionNarrative(rng, season, prevSeason),
      worldTime,
      realTime: new Date,
      seed: world.seed
    });
  }
  return { logs, newCalendar };
}
function getSeasonTransitionNarrative(rng, newSeason, oldSeason) {
  const TRANSITIONS = {
    spring: [
      "The snows melt. Rivers swell. Green returns to the land.",
      "Birds return from the south. The first flowers bloom. Hope stirs.",
      "The earth awakens from its frozen slumber. Life begins anew.",
      "Farmers eye their fields with anticipation. The planting season approaches."
    ],
    summer: [
      "The days grow long and hot. The roads dry. Travelers multiply.",
      "The sun reigns supreme. Crops grow tall. So do tempers.",
      "Campaign season begins. Armies stir. Diplomacy falters.",
      "The heat settles in. Work shifts to dawn and dusk. Midday belongs to shade."
    ],
    autumn: [
      "The leaves turn. The harvest begins. Winter preparations commence.",
      "The days shorten. The nights grow teeth. The veil thins.",
      "Granaries fill. Woodpiles grow. The wise prepare for the cold.",
      "Animals fatten. Hunters range far. The land offers its bounty—and its dangers."
    ],
    winter: [
      "The first frost arrives. The land hardens. The cold settles in.",
      "Snow blankets the world. Roads close. Communities turn inward.",
      "The long nights begin. Fires become precious. Stories pass the time.",
      "The world sleeps under white. Only the desperate or the bold venture far."
    ]
  };
  return rng.pick(TRANSITIONS[newSeason]);
}
function terrainWeatherDescription(terrain, weather, rng) {
  const TERRAIN_WEATHER = {
    road: {
      clear: ["Dust rises from the dry road.", "The cobbles gleam in sunlight."],
      cloudy: ["The road stretches grey beneath grey skies."],
      rain: ["The road has become a river of mud.", "Puddles fill every rut."],
      storm: ["The road is nearly impassable in the downpour."],
      snow: ["Snow covers the road, hiding its dangers."],
      fog: ["The road vanishes into white ahead and behind."]
    },
    forest: {
      clear: ["Shafts of light pierce the canopy."],
      cloudy: ["The forest is gloomy beneath the overcast."],
      rain: ["Rain patters on leaves, a thousand tiny drums."],
      storm: ["Branches whip and trees groan in the wind."],
      snow: ["Snow lies in patches where it pierces the canopy."],
      fog: ["Mist winds between the trunks like searching fingers."]
    },
    hills: {
      clear: ["The hilltops stand sharp against the blue."],
      cloudy: ["Clouds cling to the higher peaks."],
      rain: ["Rivulets carve new paths down every slope."],
      storm: ["Lightning seeks the hilltops. Thunder follows."],
      snow: ["The hills are white quilts, beautiful and deadly."],
      fog: ["The valleys have become lakes of mist."]
    },
    mountains: {
      clear: ["The peaks gleam with eternal snow."],
      cloudy: ["Clouds obscure all but the lowest slopes."],
      rain: ["Waterfalls multiply. The paths run with water."],
      storm: ["The mountain seems alive with fury."],
      snow: ["Fresh snow makes every path treacherous."],
      fog: ["The world shrinks to arms-length in the murk."]
    },
    swamp: {
      clear: ["Steam rises from the murky waters."],
      cloudy: ["The swamp is even more oppressive beneath grey skies."],
      rain: ["There is no shelter. Water above, water below."],
      storm: ["Lightning illuminates horrors half-seen in the reeds."],
      snow: ["Snow sits uneasily on the unfrozen mire."],
      fog: ["The fog could hide anything. It probably does."]
    },
    desert: {
      clear: ["The sun beats down without mercy."],
      cloudy: ["A rare respite from the relentless glare."],
      rain: ["The desert drinks. Flash floods threaten wadis."],
      storm: ["Sandstorm. Bury yourself and pray."],
      snow: ["The dunes wear caps of white. It will not last."],
      fog: ["Morning mist burns away by the third hour."]
    }
  };
  const options = TERRAIN_WEATHER[terrain]?.[weather] ?? ["The weather is unremarkable."];
  return rng.pick(options);
}

// src/antagonists.ts
var EPITHETS = {
  "bandit-chief": ["the Red", "Blackhand", "the Grinning", "Scar", "Goldtooth", "the Wolf"],
  "orc-warlord": ["Bonecruncher", "the Brutal", "Skullsplitter", "Bloodaxe", "the Destroyer"],
  "dark-wizard": ["the Pallid", "of the Black Tower", "the Whisperer", "Shadowbane", "the Unbound"],
  vampire: ["the Immortal", "of the Crimson Kiss", "Nightwalker", "the Thirsty", "the Ancient"],
  dragon: ["the Magnificent", "Flamescale", "the Terror", "Goldhoarth", "the Sleeping Death"],
  "cult-leader": ["the Prophet", "the Enlightened", "Voice of the Deep", "the Chosen", "the Reborn"],
  "corrupt-noble": ["the Grasping", "Silvertongue", "the Ambitious", "of the Iron Purse", "the Betrayer"],
  "renegade-knight": ["the Fallen", "Oathbreaker", "the Dishonored", "Black Shield", "the Condemned"],
  "beast-lord": ["of the Wild", "the Untamed", "Packmaster", "the Feral", "Beastcaller"],
  necromancer: ["the Pale", "Gravebinder", "of the Charnel House", "the Deathless", "Bonewarden"],
  "fey-lord": ["the Mercurial", "of the Twilight Court", "the Enchanter", "Dreamweaver", "the Fair Folk's Champion"],
  "demon-bound": ["the Damned", "Hellsworn", "of the Burning Pact", "the Tormented", "Soultrader"],
  "pirate-captain": ["Blacksail", "the Scourge", "of the Crimson Tide", "Stormchaser", "the Corsair King", "Deadwater"],
  "sea-raider": ["the Reaver", "Wavebreaker", "of the Northern Fleet", "Ironprow", "the Sea Wolf", "Saltblood"],
  "kraken-cult": ["Voice of the Deep", "the Tentacled One", "Deepcaller", "the Drowned Prophet", "Ink-Touched"],
  "ghost-ship": ["the Eternal", "of the Phantom Fleet", "Never-Sinking", "the Damned Voyage", "Deathwatch"],
  "sea-witch": ["of the Sunken Isle", "Storm-Sister", "the Tide-Turner", "Saltweaver", "the Siren's Bane"]
};
var MOTIVATIONS = {
  "bandit-chief": [
    "Wealth stolen from the rich and kept from the poor",
    "Revenge on the authorities who wronged them",
    "Building an empire of outlaws",
    "Survival in a cruel world"
  ],
  "orc-warlord": [
    "Glory in battle and dominion over the weak",
    "Uniting the tribes under one banner",
    "Driving the softskins from ancestral lands",
    "Pleasing the dark gods with slaughter"
  ],
  "pirate-captain": [
    "Plunder enough gold to retire as a king",
    "Vengeance on the navy that betrayed them",
    "Building a pirate republic free from all law",
    "Finding the legendary treasure of a lost fleet"
  ],
  "sea-raider": [
    "Glory and plunder in the old ways",
    "Claiming coastal lands for their people",
    "Sacrifices to appease the sea gods",
    "Testing their strength against softened southerners"
  ],
  "kraken-cult": [
    "Awakening the great beast from the deep",
    "Drowning the surface world in endless waves",
    "Gaining the favor of things that should not be",
    "Preparing the way for the masters below"
  ],
  "ghost-ship": [
    "Breaking the curse that binds the crew",
    "Collecting souls to replace the damned",
    "Eternal hunting of those who wronged them in life",
    "Completing the voyage they were denied"
  ],
  "sea-witch": [
    "Dominion over all who sail",
    "Revenge on the sailors who wronged them",
    "Gathering power from drowned souls",
    "Summoning leviathans to do their bidding"
  ],
  "dark-wizard": [
    "Forbidden knowledge at any cost",
    "Power over life and death",
    "Revenge on the academy that expelled them",
    "Ascending to godhood"
  ],
  vampire: [
    "Building a dynasty of the undead",
    "Reclaiming lost nobility",
    "An endless feast of blood",
    "Finding a cure—or spreading the curse"
  ],
  dragon: [
    "Accumulating a hoard beyond measure",
    "Ruling as a god over lesser beings",
    "Ancient grudges against humanity",
    "Simple, terrible hunger"
  ],
  "cult-leader": [
    "Awakening a slumbering deity",
    "Preparing the world for transformation",
    "Gathering power through faithful",
    "Fleeing a doom only they can see"
  ],
  "corrupt-noble": [
    "Absolute power over the region",
    "Wealth beyond counting",
    "Destroying rival houses",
    "Ascending to royalty"
  ],
  "renegade-knight": [
    "Vengeance on those who betrayed their honor",
    "Proving that might makes right",
    "Carving out a domain by the sword",
    "Finding redemption through blood"
  ],
  "beast-lord": [
    "Driving civilization from the wild places",
    "Protecting the beasts from hunters",
    "Ruling a kingdom of fang and claw",
    "Becoming one with the primal spirits"
  ],
  necromancer: [
    "Conquering death itself",
    "Raising an army that never tires",
    "Speaking with those long dead",
    "Punishing the living for ancient wrongs"
  ],
  "fey-lord": [
    "Reclaiming lands stolen by mortals",
    "Playing games with human lives",
    "Fulfilling ancient bargains",
    "Escaping the ennui of eternity"
  ],
  "demon-bound": [
    "Fulfilling a hellish contract",
    "Spreading corruption to delay their damnation",
    "Breaking free of infernal bonds",
    "Serving dark masters for promised power"
  ]
};
var TRAITS = {
  "bandit-chief": ["cunning tactician", "inspires fierce loyalty", "knows every back road", "never fights fair"],
  "orc-warlord": ["brutally strong", "surprisingly clever", "leads from the front", "respects worthy foes"],
  "dark-wizard": ["commands fell magic", "always prepared", "paranoid and secretive", "speaks in riddles"],
  vampire: ["supernaturally charming", "centuries of experience", "patient as the grave", "rage beneath the calm"],
  dragon: ["ancient and wise", "pride is their weakness", "treasure-obsessed", "respects courage"],
  "cult-leader": ["magnetic personality", "truly believes", "sees omens everywhere", "protects the inner circle"],
  "corrupt-noble": ["politically connected", "buys loyalty", "never gets hands dirty", "underestimates commoners"],
  "renegade-knight": ["master combatant", "broken honor haunts them", "attracts other outcasts", "seeks death in battle"],
  "beast-lord": ["fights with animal fury", "commands beasts", "hates civilization", "respects natural law"],
  necromancer: ["surrounded by undead", "fears true death", "hoards knowledge", "once was idealistic"],
  "fey-lord": ["bound by their word", "capricious moods", "allergic to iron", "cannot lie outright"],
  "demon-bound": ["hellfire at their call", "desperate and dangerous", "seeks victims constantly", "bound by the contract"],
  "pirate-captain": ["knows every cove", "crew would die for them", "master sailor", "surprisingly honorable to their code"],
  "sea-raider": ["born on the waves", "berserker fury", "strike fast and vanish", "worship the old sea gods"],
  "kraken-cult": ["speak with sea creatures", "breathe underwater", "inhuman patience", "madness grants insight"],
  "ghost-ship": ["cannot truly die", "passes through storms", "crew feels no pain", "draws other lost ships"],
  "sea-witch": ["commands weather", "knows drowned secrets", "binds sailors to service", "ageless and bitter"]
};
var WEAKNESSES = {
  "bandit-chief": ["gold can buy their followers", "enemies among their own", "wanted by law"],
  "orc-warlord": ["tribal rivalries", "superstitious", "can be challenged to single combat"],
  "dark-wizard": ["spells require preparation", "physical frailty", "obsessive over research"],
  vampire: ["sunlight", "running water", "holy symbols", "must be invited in"],
  dragon: ["vulnerable underbelly", "pride can be manipulated", "long slumber cycles"],
  "cult-leader": ["the prophecy has flaws", "rival cults", "depends on followers' faith"],
  "corrupt-noble": ["paper trail of crimes", "enemies at court", "cowardly in person"],
  "renegade-knight": ["old comrades", "sense of honor still lingers", "death wish"],
  "beast-lord": ["cannot enter settlements", "beasts can be calmed or frightened", "isolated"],
  necromancer: ["destroy the phylactery", "consecrated ground", "the dead sometimes rebel"],
  "fey-lord": ["cold iron", "broken promises", "cannot enter uninvited"],
  "demon-bound": ["holy water", "true names", "the contract has loopholes"],
  "pirate-captain": ["letters of marque can sway them", "crew loyalty has limits", "trapped on land", "old rivals among pirates"],
  "sea-raider": ["ice in their homeland", "gods demand costly sacrifices", "divided clans", "vulnerable on land"],
  "kraken-cult": ["the beast demands feeding", "other cults oppose them", "surface dwellers are needed", "symbols of the sun god"],
  "ghost-ship": ["the original log tells their doom", "holy ground blocks them", "bound to certain waters", "can be put to rest"],
  "sea-witch": ["must touch seawater daily", "iron shackles", "old lovers remember the truth", "the drowned can rebel"]
};
function generateAntagonist(rng, type, territory, threat = 3 + rng.int(5)) {
  const name = randomName(rng);
  const epithet = rng.pick(EPITHETS[type]);
  const allTraits = TRAITS[type];
  const pickedTraits = [];
  for (let i = 0;i < 2 && allTraits.length > 0; i++) {
    const t = rng.pick(allTraits);
    if (!pickedTraits.includes(t))
      pickedTraits.push(t);
  }
  const allWeaknesses = WEAKNESSES[type];
  const pickedWeaknesses = [];
  for (let i = 0;i < 2 && allWeaknesses.length > 0; i++) {
    const w = rng.pick(allWeaknesses);
    if (!pickedWeaknesses.includes(w))
      pickedWeaknesses.push(w);
  }
  return {
    id: `antagonist-${Date.now()}-${rng.int(1e4)}`,
    name,
    epithet,
    type,
    threat,
    territory,
    motivation: rng.pick(MOTIVATIONS[type]),
    notoriety: 1 + rng.int(3),
    defeats: 0,
    victories: 0,
    nemeses: [],
    followers: 5 + rng.int(threat * 10),
    treasure: 100 * threat + rng.int(500),
    alive: true,
    traits: pickedTraits,
    weaknesses: pickedWeaknesses
  };
}
function introduceAntagonist(antagonist, world, rng, worldTime) {
  const logs = [];
  const INTRO_TEMPLATES = [
    `A new threat arises: ${antagonist.name} ${antagonist.epithet}`,
    `${antagonist.name} ${antagonist.epithet} makes their presence known`,
    `Word spreads of ${antagonist.name} ${antagonist.epithet}`,
    `The shadow of ${antagonist.name} ${antagonist.epithet} falls over the region`
  ];
  const TYPE_DESCRIPTIONS = {
    "bandit-chief": [
      `A ruthless outlaw who commands a growing band of cutthroats.`,
      `Their gang has been preying on travelers and caravans.`
    ],
    "orc-warlord": [
      `The tribes rally to a new war-chief. Raids have intensified.`,
      `Orc banners have been seen where they were not seen before.`
    ],
    "dark-wizard": [
      `Strange lights and stranger disappearances mark their domain.`,
      `Wizards whisper of forbidden arts practiced in secret.`
    ],
    vampire: [
      `The pale sickness spreads. Livestock found drained.`,
      `An old castle has new occupants who shun the day.`
    ],
    dragon: [
      `Fire in the hills. Flocks decimated overnight.`,
      `The old stories speak of such terrors. Now they live again.`
    ],
    "cult-leader": [
      `A new faith spreads among the desperate and dispossessed.`,
      `Rituals in the night. Converts who speak in tongues.`
    ],
    "corrupt-noble": [
      `Taxes rise. Justice is bought and sold. The law protects only the wealthy.`,
      `Those who speak against them disappear. Those who comply grow poor.`
    ],
    "renegade-knight": [
      `A warrior who abandoned oaths now carves a bloody path.`,
      `Former comrades weep for what they must hunt.`
    ],
    "beast-lord": [
      `The forests grow dangerous. Animals attack without provocation.`,
      `Hunters become the hunted. Something commands the wild things.`
    ],
    necromancer: [
      `Graves disturbed. The dead walk. Children have nightmares.`,
      `Old tombs have been opened. What was taken? What was released?`
    ],
    "fey-lord": [
      `Time runs strange near the old stones. Travelers vanish for years.`,
      `The Fair Folk hold court in the twilight, and mortals are their toys.`
    ],
    "demon-bound": [
      `Sulfur and screaming in the night. Bargains offered at crossroads.`,
      `Someone has made a pact. The price will be paid by many.`
    ]
  };
  logs.push({
    category: "faction",
    summary: rng.pick(INTRO_TEMPLATES),
    details: rng.pick(TYPE_DESCRIPTIONS[antagonist.type]),
    location: antagonist.territory,
    actors: [`${antagonist.name} ${antagonist.epithet}`],
    worldTime,
    realTime: new Date,
    seed: world.seed
  });
  queueConsequence({
    type: "spawn-rumor",
    triggerEvent: `${antagonist.name} appearance`,
    turnsUntilResolution: 1 + rng.int(6),
    data: {
      origin: antagonist.territory,
      target: antagonist.territory,
      kind: "threat",
      text: `Travelers speak of ${antagonist.name} ${antagonist.epithet}. ${antagonist.motivation}.`
    },
    priority: 4
  });
  return logs;
}
function antagonistAct(antagonist, world, rng, worldTime) {
  const logs = [];
  if (!antagonist.alive)
    return logs;
  const ACTIONS = {
    "bandit-chief": [
      { summary: `${antagonist.name}'s gang raids a caravan`, details: "Goods seized, drivers left bound on the road." },
      { summary: `${antagonist.name} expands their territory`, details: "New hideouts established. More recruits join." },
      { summary: `${antagonist.name} offers "protection"`, details: "Villages face a choice: pay tribute or burn." }
    ],
    "orc-warlord": [
      { summary: `${antagonist.name}'s horde raids the frontier`, details: "Farms burned. Captives taken." },
      { summary: `${antagonist.name} demands tribute`, details: "Submit or be destroyed, the messengers say." },
      { summary: `${antagonist.name} defeats a rival chief`, details: "The horde grows stronger. Warbands unite." }
    ],
    "dark-wizard": [
      { summary: `${antagonist.name} conducts a dark ritual`, details: "Strange lights in the sky. Animals flee." },
      { summary: `Agents of ${antagonist.name} gather components`, details: "Graverobbing. Herb theft. Missing children." },
      { summary: `${antagonist.name} curses a village`, details: "Crops wither. Wells run foul. Prayers go unanswered." }
    ],
    vampire: [
      { summary: `${antagonist.name} claims another victim`, details: "Pale. Drained. The marks are unmistakable." },
      { summary: `${antagonist.name} turns a new thrall`, details: "Another joins the undying court." },
      { summary: `${antagonist.name} hosts a midnight ball`, details: "Nobles attend. Some do not return." }
    ],
    dragon: [
      { summary: `${antagonist.name} demands tribute`, details: "Gold and livestock, or the village burns." },
      { summary: `${antagonist.name} is seen on the wing`, details: "Terror grips all who witness the passage." },
      { summary: `${antagonist.name} destroys a settlement`, details: "Fire and ruin. Few survivors." }
    ],
    "cult-leader": [
      { summary: `${antagonist.name} gains new followers`, details: "The desperate find purpose. The faithful grow." },
      { summary: `${antagonist.name} performs a public miracle`, details: "Believers multiply. Skeptics are troubled." },
      { summary: `${antagonist.name} declares a prophecy`, details: "The end times approach. Only the faithful will be saved." }
    ],
    "corrupt-noble": [
      { summary: `${antagonist.name} seizes more land`, details: "Legal pretexts, backed by armed men." },
      { summary: `${antagonist.name} silences a critic`, details: "An accident. Everyone knows. No one speaks." },
      { summary: `${antagonist.name} hosts a lavish feast`, details: "While the common folk starve, nobles toast." }
    ],
    "renegade-knight": [
      { summary: `${antagonist.name} challenges a champion`, details: "Another body. Another notch on a bloodied blade." },
      { summary: `${antagonist.name} takes a keep by force`, details: "No quarter given. No surrender accepted." },
      { summary: `${antagonist.name} recruits dispossessed knights`, details: "A fellowship of the fallen forms." }
    ],
    "beast-lord": [
      { summary: `${antagonist.name}'s beasts attack travelers`, details: "Wolves. Bears. Worse. They hunt together." },
      { summary: `${antagonist.name} drives settlers from the forest`, details: "Homesteads abandoned. The wild reclaims." },
      { summary: `${antagonist.name} corrupts tame animals`, details: "Dogs turn on masters. Horses bolt into the wild." }
    ],
    necromancer: [
      { summary: `${antagonist.name} raises the dead`, details: "A cemetery stands empty. Its occupants walk." },
      { summary: `${antagonist.name} binds a powerful spirit`, details: "The hauntings begin. None can rest." },
      { summary: `${antagonist.name} seeks ancient tombs`, details: "Old graves are opened. Old evils released." }
    ],
    "fey-lord": [
      { summary: `${antagonist.name} steals a child`, details: "A changeling left in the cradle." },
      { summary: `${antagonist.name} enchants a grove`, details: "Those who enter forget the way out." },
      { summary: `${antagonist.name} makes a bargain`, details: "A mortal gets their wish. The price comes due." }
    ],
    "demon-bound": [
      { summary: `${antagonist.name} offers dark bargains`, details: "Desperate souls sign away more than they know." },
      { summary: `${antagonist.name} spreads corruption`, details: "Madness. Violence. The taint spreads." },
      { summary: `${antagonist.name} summons a lesser demon`, details: "The pact demands servants. Servants are provided." }
    ]
  };
  const action = rng.pick(ACTIONS[antagonist.type]);
  antagonist.notoriety = Math.min(10, antagonist.notoriety + 1);
  antagonist.lastSeen = worldTime;
  antagonist.followers = (antagonist.followers ?? 0) + rng.int(3);
  antagonist.treasure = (antagonist.treasure ?? 0) + rng.int(10);
  logs.push({
    category: "faction",
    summary: action.summary,
    details: action.details,
    location: antagonist.territory,
    actors: [`${antagonist.name} ${antagonist.epithet}`],
    worldTime,
    realTime: new Date,
    seed: world.seed
  });
  const settlement = world.settlements.find((s) => s.name === antagonist.territory);
  if (settlement) {
    settlement.mood = Math.max(-5, settlement.mood - 1);
    if (["bandit-chief", "orc-warlord", "dragon"].includes(antagonist.type) && rng.chance(0.5)) {
      const goods = Object.keys(settlement.supply);
      const targetGood = rng.pick(goods);
      const stolen = Math.min(settlement.supply[targetGood], 2 + rng.int(5));
      settlement.supply[targetGood] -= stolen;
      if (stolen > 0) {
        logs.push({
          category: "town",
          summary: `${antagonist.territory} suffers losses`,
          details: `${antagonist.name}'s depredations cost the settlement dearly. Supplies dwindle.`,
          location: antagonist.territory,
          worldTime,
          realTime: new Date,
          seed: world.seed
        });
      }
    }
  }
  if (antagonist.type === "cult-leader" && rng.chance(0.3)) {
    const npcsHere = world.npcs.filter((n) => n.location === antagonist.territory && n.alive !== false);
    if (npcsHere.length > 0) {
      const convert = rng.pick(npcsHere);
      convert.reputation = Math.max(-3, convert.reputation - 1);
      logs.push({
        category: "town",
        summary: `${convert.name} falls under ${antagonist.name}'s influence`,
        details: `The ${convert.role}'s eyes hold a new fervor. They speak of the prophet's wisdom.`,
        location: antagonist.territory,
        actors: [convert.name, antagonist.name],
        worldTime,
        realTime: new Date,
        seed: world.seed
      });
    }
  }
  if (antagonist.type === "vampire" && rng.chance(0.2)) {
    const npcsHere = world.npcs.filter((n) => n.location === antagonist.territory && n.alive !== false);
    if (npcsHere.length > 0) {
      const victim = rng.pick(npcsHere);
      victim.alive = false;
      logs.push({
        category: "town",
        summary: `${victim.name} found dead in ${antagonist.territory}`,
        details: `Pale. Drained. The marks of ${antagonist.name}'s feeding are unmistakable.`,
        location: antagonist.territory,
        actors: [victim.name],
        worldTime,
        realTime: new Date,
        seed: world.seed
      });
      queueConsequence({
        type: "settlement-change",
        triggerEvent: `${victim.name}'s death`,
        turnsUntilResolution: 1,
        data: {
          settlementName: antagonist.territory,
          change: "mood-shift",
          magnitude: -2
        },
        priority: 3
      });
    }
  }
  if (antagonist.type === "dragon" && rng.chance(0.2)) {
    if (settlement) {
      const goods = Object.keys(settlement.supply);
      for (const good of goods) {
        settlement.supply[good] = Math.max(0, settlement.supply[good] - rng.int(3));
      }
      settlement.mood = Math.max(-5, settlement.mood - 2);
      logs.push({
        category: "town",
        summary: `${antagonist.name} burns ${antagonist.territory}`,
        details: `Fire rains from above. The settlement counts its dead and mourns its losses.`,
        location: antagonist.territory,
        worldTime,
        realTime: new Date,
        seed: world.seed
      });
    }
  }
  if (rng.chance(0.3)) {
    queueConsequence({
      type: "settlement-change",
      triggerEvent: action.summary,
      turnsUntilResolution: 2,
      data: {
        settlementName: antagonist.territory,
        change: "mood-shift",
        magnitude: -1
      },
      priority: 2
    });
  }
  if (antagonist.notoriety >= 3 && rng.chance(0.4)) {
    for (const s of world.settlements) {
      if (s.name !== antagonist.territory && rng.chance(0.3)) {
        queueConsequence({
          type: "spawn-rumor",
          triggerEvent: action.summary,
          turnsUntilResolution: 3 + rng.int(6),
          data: {
            origin: s.name,
            target: antagonist.territory,
            kind: "monster-sign",
            text: `Travelers speak of ${antagonist.name} ${antagonist.epithet}. The roads grow dangerous.`
          },
          priority: 3
        });
      }
    }
  }
  return logs;
}
function seedAntagonists(rng, world) {
  const antagonists = [];
  const count = 1 + rng.int(3);
  const types = [
    "bandit-chief",
    "bandit-chief",
    "orc-warlord",
    "dark-wizard",
    "cult-leader",
    "corrupt-noble",
    "beast-lord",
    "necromancer"
  ];
  for (let i = 0;i < count; i++) {
    const type = rng.pick(types);
    const territory = rng.pick(world.settlements).name;
    const threat = 2 + rng.int(4);
    antagonists.push(generateAntagonist(rng, type, territory, threat));
  }
  return antagonists;
}

// src/ruins.ts
var RUIN_NAMES = ["Citadel", "Catacombs", "Sanctum", "Archives", "Forge", "Bastion", "Ossuary", "Vault"];
var RUIN_ADJECTIVES = ["Shattered", "Forgotten", "Buried", "Nameless", "Sunken", "Cursed", "Ashen", "Silver"];
function generateProceduralRuin(rng, location, terrain, world) {
  const name = `${rng.pick(RUIN_ADJECTIVES)} ${rng.pick(RUIN_NAMES)}`;
  const depth = 2 + rng.int(4);
  const danger = 2 + rng.int(5);
  const ruin = {
    id: `ruin-${Date.now()}-${rng.int(1000)}`,
    name,
    description: `An ancient ${name.toLowerCase()} from the ${rng.pick(["Age of Wonders", "First Age", "Empire of Dust"])}.`,
    location,
    rooms: [],
    cleared: false,
    danger,
    history: `${name} was once a center of ${rng.pick(["magic", "trade", "war", "faith"])} before its fall.`
  };
  ruin.rooms = stockDungeon(rng, {
    depth,
    danger,
    id: ruin.id,
    name: ruin.name,
    coord: ruin.location
  });
  return ruin;
}
function tickRuins(world, rng, worldTime) {
  const logs = [];
  for (const ruin of world.ruins) {
    if (ruin.cleared && !ruin.occupiedBy && rng.chance(0.01)) {
      const faction = rng.pick(world.factions);
      ruin.occupiedBy = faction.name;
      ruin.cleared = false;
      ruin.danger += 2;
      logs.push({
        category: "faction",
        summary: `${faction.name} occupies ${ruin.name}`,
        details: `Seeking a strategic base, the faction has moved into the cleared ruins.`,
        location: `hex:${ruin.location.q},${ruin.location.r}`,
        actors: [faction.name],
        worldTime,
        realTime: new Date,
        seed: world.seed
      });
    }
  }
  return logs;
}

// src/encounters-enhanced.ts
var CREATURES_BY_TERRAIN = {
  road: {
    creatures: ["bandits", "merchants", "pilgrims", "patrol guards", "beggars", "deserters", "traveling entertainers", "tax collectors"],
    weights: [3, 2, 2, 2, 1, 1, 1, 1]
  },
  clear: {
    creatures: ["bandits", "wolves", "goblins", "wild dogs", "cattle rustlers", "patrol guards", "wandering knights", "peasant militia"],
    weights: [2, 2, 2, 1, 1, 1, 1, 1]
  },
  forest: {
    creatures: ["wolves", "goblins", "brigands", "giant spiders", "wood elves", "bears", "outlaws", "druids", "owlbears"],
    weights: [2, 2, 2, 1, 1, 1, 1, 1, 1]
  },
  hills: {
    creatures: ["orc raiders", "goblins", "brigands", "ogres", "hill giants", "mountain lions", "goatherds", "prospectors"],
    weights: [2, 2, 2, 1, 1, 1, 1, 1]
  },
  mountains: {
    creatures: ["orc raiders", "giant eagles", "goblins", "ogres", "trolls", "dwarven patrols", "yeti", "wyverns"],
    weights: [2, 2, 2, 1, 1, 1, 1, 1]
  },
  swamp: {
    creatures: ["lizardfolk", "giant leeches", "goblins", "will-o-wisps", "crocodiles", "bullywugs", "hags", "shambling mounds"],
    weights: [2, 2, 2, 1, 1, 1, 1, 1]
  },
  desert: {
    creatures: ["bandits", "giant scorpions", "gnolls", "nomads", "giant snakes", "sand wurms", "dust devils", "mummies"],
    weights: [2, 2, 2, 1, 1, 1, 1, 1]
  },
  coastal: {
    creatures: ["pirates", "smugglers", "fishermen", "sahuagin", "sea hags", "giant crabs", "merfolk", "shipwreck survivors"],
    weights: [2, 2, 2, 1, 1, 1, 1, 1]
  },
  ocean: {
    creatures: ["sea serpent", "pirates", "merfolk", "sahuagin raiders", "giant sharks", "water elementals", "ghost ship", "kraken spawn"],
    weights: [2, 2, 2, 1, 1, 1, 1, 1]
  },
  reef: {
    creatures: ["giant crabs", "merfolk", "sahuagin", "sea hags", "nixies", "lacedons", "shipwreck survivors", "treasure hunters"],
    weights: [2, 2, 2, 1, 1, 1, 1, 1]
  },
  river: {
    creatures: ["fishermen", "smugglers", "river pirates", "giant pike", "nixies", "water elementals", "crocodiles", "kelpies"],
    weights: [2, 2, 2, 1, 1, 1, 1, 1]
  }
};
var CREATURE_DESCRIPTORS = {
  bandits: ["ragged", "well-armed", "desperate", "cocky", "scarred", "masked"],
  goblins: ["mangy", "sneaky", "cowardly", "cunning", "tribal", "feral"],
  wolves: ["gaunt", "massive", "winter-hungry", "shadowy", "patient", "silver-furred"],
  "orc raiders": ["battle-scarred", "tribal", "disciplined", "frenzied", "mounted", "war-painted"],
  brigands: ["former soldiers", "ruthless", "organized", "poorly equipped", "seasoned", "cruel"],
  pirates: ["salt-crusted", "tattooed", "cutlass-wielding", "one-eyed", "rum-soaked", "desperate"],
  smugglers: ["nervous", "well-connected", "armed", "secretive", "night-working", "cunning"],
  sahuagin: ["scaled", "trident-wielding", "pack-hunting", "blood-frenzied", "deep-dwelling", "territorial"],
  merfolk: ["curious", "wary", "shimmering", "armed with coral spears", "singing", "ancient-looking"],
  "sea serpent": ["massive", "coiling", "barnacle-encrusted", "ancient", "territorial", "hungry"],
  "giant crabs": ["armored", "snapping", "massive-clawed", "beach-dwelling", "aggressive", "tide-hunting"],
  "sea hags": ["cackling", "seaweed-draped", "curse-wielding", "drowned-looking", "malevolent", "ancient"],
  nixies: ["playful", "enchanting", "mischievous", "water-dancing", "alluring", "territorial"],
  "ghost ship": ["spectral", "fog-shrouded", "creaking", "crewed by the damned", "silent", "cursed"],
  ogres: ["dim-witted", "hungry", "massive", "armored", "solitary", "kin to giants"],
  "giant spiders": ["web-spinning", "venomous", "patient", "ancient", "bloated", "intelligent"],
  lizardfolk: ["scaled warriors", "primitive", "territorial", "shaman-led", "hunting party", "traders"],
  default: ["dangerous", "wary", "aggressive", "territorial", "numerous", "scarce"]
};
var CREATURE_BEHAVIORS = {
  bandits: [
    "demanding toll",
    "setting an ambush",
    "fleeing from the law",
    "recruiting",
    "celebrating a recent score"
  ],
  goblins: [
    "arguing among themselves",
    "tracking something",
    "carrying plunder",
    "setting crude traps",
    "worshipping a crude idol"
  ],
  wolves: [
    "hunting in formation",
    "circling warily",
    "following the scent of blood",
    "protecting young",
    "starving and desperate"
  ],
  "orc raiders": [
    "returning from a raid",
    "scouting for targets",
    "performing war rituals",
    "dragging captives",
    "quarreling over spoils"
  ],
  default: [
    "watching warily",
    "moving with purpose",
    "apparently startled",
    "blocking the path",
    "emerging from concealment"
  ]
};
var NUMBERS_DESCRIPTORS = {
  lone: ["a solitary", "a single", "one", "a lone"],
  few: ["a handful of", "several", "a few", "two or three"],
  band: ["a band of", "a group of", "many", "a company of"],
  horde: ["a horde of", "countless", "a swarm of", "an army of"]
};
function weightedPick(rng, items, weights) {
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = rng.next() * total;
  for (let i = 0;i < items.length; i++) {
    roll -= weights[i];
    if (roll <= 0)
      return items[i];
  }
  return items[items.length - 1];
}
function generateCreature(rng, terrain, isNight) {
  const table = CREATURES_BY_TERRAIN[terrain] ?? CREATURES_BY_TERRAIN.clear;
  const type = weightedPick(rng, table.creatures, table.weights);
  const isNamed = rng.chance(0.08);
  const numbersRoll = rng.next();
  let numbers;
  if (numbersRoll < 0.2)
    numbers = "lone";
  else if (numbersRoll < 0.6)
    numbers = "few";
  else if (numbersRoll < 0.9)
    numbers = "band";
  else
    numbers = "horde";
  const loners = ["ogres", "trolls", "bears", "yeti", "hags"];
  if (loners.includes(type) && numbers !== "horde") {
    numbers = rng.chance(0.7) ? "lone" : "few";
  }
  const descriptors = CREATURE_DESCRIPTORS[type] ?? CREATURE_DESCRIPTORS.default;
  const behaviors = CREATURE_BEHAVIORS[type] ?? CREATURE_BEHAVIORS.default;
  let name = type;
  if (isNamed) {
    const properName = randomName(rng);
    const NAMED_FORMATS = [
      `${properName}'s ${type}`,
      `${properName} the ${rng.pick(descriptors)}`,
      `the ${type} called ${properName}`
    ];
    name = rng.pick(NAMED_FORMATS);
  }
  if (isNight) {
    descriptors.push("shadow-cloaked", "night-hunting", "red-eyed in the dark");
  }
  return {
    name,
    type,
    isNamed,
    numbers,
    descriptor: rng.pick(descriptors),
    behavior: rng.pick(behaviors)
  };
}
var BEAT_STRUCTURES = [
  { name: "Monolith", types: ["forest", "hills", "mountains", "desert"] },
  { name: "Obelisk", types: ["swamp", "desert", "clear"] },
  { name: "Statue", types: ["clear", "hills", "road"] },
  { name: "Grove", types: ["forest", "swamp"] },
  { name: "Cave", types: ["hills", "mountains", "forest"] },
  { name: "Spring", types: ["forest", "mountains", "clear"] },
  { name: "Altar", types: ["mountains", "swamp", "desert"] },
  { name: "Cairn", types: ["hills", "mountains", "road"] },
  { name: "Ruin", types: ["clear", "forest", "swamp", "desert"] },
  { name: "Pillar", types: ["desert", "mountains"] },
  { name: "Tree", types: ["forest", "swamp", "clear"] },
  { name: "Pool", types: ["swamp", "forest", "clear"] }
];
var BEAT_DESCRIPTORS = [
  "obsidian",
  "glowing",
  "ancient",
  "weeping",
  "moss-covered",
  "cracked",
  "sun-bleached",
  "overgrown",
  "floating",
  "shadowy",
  "silver",
  "eerie",
  "blood-stained",
  "weather-worn",
  "perfectly smooth",
  "crystalline",
  "petrified"
];
var BEAT_ACTIVITIES = [
  "pulsing with a faint, rhythmic light",
  "whispering in an unknown, melodic tongue",
  "dripping with a thick, dark sap",
  "swarming with spectral, blue butterflies",
  "humming a low, vibrating note",
  "surrounded by a thin, unnerving mist",
  "etched with shifting, golden runes",
  "home to a silent, white-haired hermit",
  "bearing the marks of a thousand years",
  "smelling of summer rain and ozone",
  "vibrating when approached",
  "swallowing all sound around it"
];
var BEAT_EFFECTS = [
  { name: "arcane-insight", text: "The party feels a surge of mental clarity.", fatigue: -1 },
  { name: "historical-knowledge", text: "They uncover a fragment of lost history.", rumorKind: "mystery" },
  { name: "prophetic-hint", text: "A sudden vision of what is to come flashes before them.", rumorKind: "omen" },
  { name: "fey-blessing", text: "A light heart and swift feet follow them.", fatigue: -2 },
  { name: "treasure-clue", text: "They find a marking pointing toward a hidden cache.", rumorKind: "dungeon" }
];
function generateProceduralBeat(rng, terrain, party, worldTime, world) {
  const structurePool = BEAT_STRUCTURES.filter((s) => s.types.includes(terrain));
  const structure = (structurePool.length > 0 ? rng.pick(structurePool) : BEAT_STRUCTURES[0]).name;
  const descriptor = rng.pick(BEAT_DESCRIPTORS);
  const activity = rng.pick(BEAT_ACTIVITIES);
  const effect = rng.pick(BEAT_EFFECTS);
  const beatName = `The ${capitalize2(descriptor)} ${structure}`;
  const settlement = world.settlements.find((s) => s.name === party.location);
  const location = settlement ? settlement.coord : { q: rng.int(world.width), r: rng.int(world.height) };
  return {
    id: `landmark-${Date.now()}-${rng.int(1000)}`,
    name: beatName,
    description: `A ${descriptor} ${structure.toLowerCase()}, ${activity}.`,
    location,
    terrain,
    discoveryDate: worldTime,
    discoveredBy: party.name,
    effect: effect.name,
    knownBy: [party.name]
  };
}
function enhancedEncounter(rng, terrain, worldTime, location, party, world, calendar) {
  const hour = worldTime.getUTCHours();
  const isNight = hour < 6 || hour >= 18;
  const phase = getTimeOfDayPhase(hour);
  const BASE_ODDS = {
    road: 1 / 12,
    clear: 1 / 8,
    forest: 1 / 6,
    hills: 1 / 6,
    mountains: 1 / 5,
    swamp: 1 / 5,
    desert: 1 / 6,
    coastal: 1 / 8,
    ocean: 1 / 6,
    reef: 1 / 5,
    river: 1 / 8
  };
  let odds = BASE_ODDS[terrain] ?? 1 / 8;
  if (world.ecologyState) {
    const nearbyPopulations = world.ecologyState.populations.filter((pop) => pop.population > 0 && pop.territoryName === location);
    if (nearbyPopulations.length > 0) {
      odds *= 1.3;
    }
  }
  if (isNight && terrain !== "road") {
    odds *= 1.5;
  }
  if (calendar) {
    const effects = getWeatherEffects(calendar.weather);
    odds *= effects.encounterChanceMod;
  }
  if (calendar?.moonPhase === "full") {
    odds *= 1.2;
  }
  if (!rng.chance(odds)) {
    if (rng.chance(0.05)) {
      if (rng.chance(0.2)) {
        const settlement = world.settlements.find((s) => s.name === party.location);
        const coord = settlement ? settlement.coord : { q: rng.int(world.width), r: rng.int(world.height) };
        let ruin = world.ruins?.find((r) => r.location.q === coord.q && r.location.r === coord.r);
        if (!ruin) {
          ruin = generateProceduralRuin(rng, coord, terrain, world);
          if (!world.ruins)
            world.ruins = [];
          world.ruins.push(ruin);
        }
        return {
          category: "dungeon",
          summary: `${party.name} discovers ${ruin.name}`,
          details: `${atmosphericOpening(rng, worldTime, terrain)} They have found ${ruin.description} ${ruin.history}`,
          location,
          actors: [party.name],
          worldTime,
          realTime: new Date,
          seed: world.seed
        };
      }
      const landmark = generateProceduralBeat(rng, terrain, party, worldTime, world);
      world.landmarks.push(landmark);
      const effect = BEAT_EFFECTS.find((e) => e.name === landmark.effect);
      if (effect?.rumorKind && world) {
        queueConsequence({
          type: "spawn-rumor",
          triggerEvent: `Discovery of ${landmark.name}`,
          turnsUntilResolution: 12 + rng.int(24),
          data: {
            origin: location,
            target: location,
            kind: effect.rumorKind,
            text: `Explorers speak of a strange discovery near ${location}.`
          },
          priority: 3
        });
      }
      return {
        category: "road",
        summary: `${party.name} discovers ${landmark.name}`,
        details: `${atmosphericOpening(rng, worldTime, terrain)} ${landmark.description} ${effect?.text ?? ""}`,
        location,
        actors: [party.name],
        worldTime,
        realTime: new Date,
        seed: world.seed,
        fatigueDelta: effect?.fatigue ?? 0
      };
    }
    return;
  }
  const creature = generateCreature(rng, terrain, isNight);
  const reactionRoll = 2 + rng.int(6) + rng.int(6);
  let reaction2;
  if (reactionRoll >= 10)
    reaction2 = "friendly";
  else if (reactionRoll >= 6)
    reaction2 = "cautious";
  else
    reaction2 = "hostile";
  if ((party.fame ?? 0) >= 5 && reaction2 === "cautious") {
    reaction2 = rng.chance(0.3) ? "friendly" : "cautious";
  }
  const alwaysHostile = ["giant spiders", "giant leeches", "giant scorpions", "trolls", "mummies", "shambling mounds"];
  if (alwaysHostile.includes(creature.type)) {
    reaction2 = "hostile";
  }
  let outcome;
  let injured = false;
  let death = false;
  let delayMiles = 0;
  let fatigueDelta = 0;
  let treasure = 0;
  let storyEscalation = false;
  const hasArcane = party.members.some((m) => m.class === "Magic-User" || m.class === "Elf");
  const hasDivine = party.members.some((m) => m.class === "Cleric");
  const hasThief = party.members.some((m) => m.class === "Thief" || m.class === "Halfling");
  if (reaction2 === "friendly") {
    outcome = "negotiation";
    if (rng.chance(0.3)) {
      storyEscalation = true;
    }
  } else if (reaction2 === "cautious") {
    if (rng.chance(0.5)) {
      outcome = "negotiation";
      delayMiles = rng.chance(0.3) ? 2 + rng.int(4) : 0;
    } else {
      outcome = "flight";
      delayMiles = 3 + rng.int(3);
      fatigueDelta = rng.chance(0.3) ? 1 : 0;
    }
  } else {
    const combatRoll = rng.next();
    let partyStrength = 0.6;
    partyStrength += (party.fame ?? 0) * 0.02;
    if (hasArcane)
      partyStrength += 0.1;
    if (hasDivine)
      partyStrength += 0.05;
    if (hasThief)
      partyStrength += 0.05;
    const averageLevel = party.members.reduce((sum, m) => sum + m.level, 0) / party.members.length;
    partyStrength += (averageLevel - 1) * 0.05;
    if (combatRoll < partyStrength) {
      outcome = "victory";
      injured = rng.chance(0.2);
      treasure = rng.chance(0.4) ? 10 + rng.int(50) : 0;
      fatigueDelta = rng.chance(0.3) ? 1 : 0;
      party.xp += 100 + rng.int(500);
      if (creature.isNamed || creature.numbers === "horde") {
        storyEscalation = true;
      }
    } else if (combatRoll < partyStrength + 0.25) {
      outcome = "defeat";
      injured = true;
      delayMiles = 6 + rng.int(6);
      fatigueDelta = 1 + rng.int(2);
      death = rng.chance(0.15);
      storyEscalation = true;
    } else {
      outcome = "flight";
      delayMiles = 4 + rng.int(4);
      fatigueDelta = 1;
      injured = rng.chance(0.25);
    }
  }
  const flavorText = encounterFlavorText(rng, creature.name, reaction2, outcome, terrain, [party.name]);
  const atmosOpening = atmosphericOpening(rng, worldTime, terrain, reaction2 === "hostile" ? "tense" : undefined);
  const weatherDetail = calendar ? terrainWeatherDescription(terrain, calendar.weather, rng) : "";
  const numberDesc = rng.pick(NUMBERS_DESCRIPTORS[creature.numbers]);
  let fullDetails = `${atmosOpening} `;
  if (weatherDetail && rng.chance(0.4)) {
    fullDetails += `${weatherDetail} `;
  }
  fullDetails += `${capitalize2(numberDesc)} ${creature.descriptor} ${creature.type}, ${creature.behavior}. `;
  fullDetails += flavorText.details;
  if (outcome === "victory") {
    if (hasArcane && rng.chance(0.4)) {
      fullDetails += ` A well-timed spell from their caster turned the tide.`;
    } else if (hasDivine && rng.chance(0.4)) {
      fullDetails += ` Divine favor shielded them from the worst of the blows.`;
    }
  }
  if (treasure > 0) {
    fullDetails += ` The victors claim ${treasure} coin worth of plunder.`;
  }
  const entry = {
    category: "road",
    summary: flavorText.summary,
    details: fullDetails,
    location,
    actors: [party.name, creature.name],
    worldTime,
    realTime: new Date,
    seed: world.seed,
    delayMiles,
    fatigueDelta,
    injured,
    death
  };
  analyzeEventForConsequences(entry, world, rng);
  if (storyEscalation && creature.isNamed && outcome !== "victory") {
    queueConsequence({
      type: "spawn-antagonist",
      triggerEvent: entry.summary,
      turnsUntilResolution: 24 + rng.int(72),
      data: {
        location,
        threat: `${creature.name} gathers strength and swears revenge`,
        origin: `defeat at the hands of ${party.name}`
      },
      priority: 3
    });
  }
  return entry;
}
function capitalize2(s) {
  if (!s)
    return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function encounterSign(rng, terrain, worldTime, location, partyName, seed) {
  if (!rng.chance(0.15))
    return;
  const SIGNS = {
    road: [
      "Fresh hoofprints diverge from the road, as if riders left in haste.",
      "A broken wagon wheel lies by the verge. No sign of the wagon.",
      "Crows gather ahead. They scatter at your approach.",
      "A weathered signpost has been defaced with crude warnings."
    ],
    clear: [
      "Trampled grass marks the passage of many feet.",
      "Smoke rises from beyond the next hill.",
      "Livestock have fled into the open, masterless and panicked.",
      "A campfire, still warm, but hastily abandoned."
    ],
    forest: [
      "Claw marks on the trees, head-height or higher.",
      "Webs span the path ahead, freshly spun.",
      "A hunter's blind, recently occupied. Arrow nocks in the bark.",
      "The birds have gone silent. Something is wrong."
    ],
    hills: [
      "Caves in the hillside show signs of habitation.",
      "Bones litter a rock shelf. Not all are animal bones.",
      "Crude totems mark a boundary. You have been warned.",
      "Rockfall has blocked the easy path. An ambush site, perhaps."
    ],
    mountains: [
      "Giant footprints in the snow, each as long as a man is tall.",
      "The ruins of a dwarven waystation, recently looted.",
      "Eagle cries echo, but no birds are visible.",
      "A cairn of skulls marks a territorial boundary."
    ],
    swamp: [
      "Ripples in the water. Something large is moving.",
      "A boat, half-sunken. Its passengers are nowhere to be seen.",
      "Strange lights dance over the water. Will-o-wisps?",
      "Fetish dolls hang from the dead trees. Warnings or invitations?"
    ],
    desert: [
      "Bleached bones half-buried in the sand.",
      "An oasis—but no birds sing there, and the water is too still.",
      "Tracks in the sand, leading toward you. Many feet. Clawed.",
      "A buried structure protrudes from a dune. Something ancient stirs."
    ]
  };
  const signs = SIGNS[terrain] ?? SIGNS.clear;
  const sign = rng.pick(signs);
  return {
    category: "road",
    summary: `${partyName} spot signs of danger`,
    details: sign,
    location,
    actors: [partyName],
    worldTime,
    realTime: new Date,
    seed
  };
}

// src/stories.ts
var STORY_TEMPLATES = [
  {
    type: "hunt",
    titles: ["The Hunt for %ACTOR%", "Tracking the %ACTOR%", "%ACTOR%'s Last Stand", "Blood on the Trail"],
    summaries: (actors, location) => [
      `${actors[0]} stalks ${actors[1] ?? "a dangerous quarry"} across the region.`,
      `A deadly game of cat and mouse unfolds near ${location}.`,
      `The hunt enters its final phase. One will not survive.`
    ],
    outcomes: [
      "The quarry is slain.",
      "The quarry escapes to parts unknown.",
      "The hunters become the hunted.",
      "An unexpected alliance forms.",
      "The quarry is captured alive—but for what purpose?"
    ]
  },
  {
    type: "feud",
    titles: ["Blood Between %ACTOR% and %ACTOR%", "The %LOCATION% Vendetta", "Old Grievances", "A House Divided"],
    summaries: (actors, location) => [
      `Bad blood between ${actors[0]} and ${actors[1] ?? "their enemies"} threatens to spill over.`,
      `${location} becomes the stage for an escalating conflict.`,
      `Ancient grudges flare anew. Neither side will back down.`
    ],
    outcomes: [
      "One side is destroyed utterly.",
      "A fragile peace is negotiated.",
      "Both sides are weakened; a third party profits.",
      "The feud spreads, drawing in new participants.",
      "Marriage unites the feuding parties—but for how long?"
    ]
  },
  {
    type: "revenge",
    titles: ["%ACTOR%'s Vengeance", "Debts Paid in Blood", "The Reckoning", "Cold Revenge"],
    summaries: (actors, location) => [
      `${actors[0]} has sworn to make ${actors[1] ?? "someone"} pay.`,
      `An old wrong demands answer. Blood will flow in ${location}.`,
      `Years of planning come to fruition. The target has no idea.`
    ],
    outcomes: [
      "Vengeance is achieved. The avenger finds no peace.",
      "The target proves too strong. The avenger falls.",
      "Revenge begets revenge. The cycle continues.",
      "Forgiveness prevails. Both parties find closure.",
      "The wrong turns out to be a misunderstanding—too late."
    ]
  },
  {
    type: "war",
    titles: ["The %LOCATION% War", "Drums of War", "The Coming Storm", "When Banners Fly"],
    summaries: (actors, location) => [
      `${actors[0]} and ${actors[1] ?? "their enemies"} mass for conflict.`,
      `War clouds gather over ${location}. The common folk suffer.`,
      `Armies march. Diplomacy has failed.`
    ],
    outcomes: [
      "One side achieves total victory.",
      "Stalemate grinds both sides down.",
      "A greater threat forces alliance.",
      "The war spreads beyond control.",
      "Mutual exhaustion leads to an uneasy truce."
    ]
  },
  {
    type: "siege",
    titles: ["The Siege of %LOCATION%", "Walls of %LOCATION%", "Starvation and Steel", "No Relief Coming"],
    summaries: (actors, location) => [
      `${location} is encircled. Supplies dwindle.`,
      `${actors[0]} tightens the noose around ${location}.`,
      `Every day without relief, hope fades inside the walls.`
    ],
    outcomes: [
      "The walls are breached. Slaughter follows.",
      "A relief force breaks the siege.",
      "Starvation forces surrender.",
      "A secret tunnel allows escape.",
      "Treachery opens the gates from within."
    ]
  },
  {
    type: "rebellion",
    titles: ["The %LOCATION% Uprising", "Torches in the Night", "The People Rise", "Breaking Chains"],
    summaries: (actors, location) => [
      `The common folk of ${location} have had enough.`,
      `${actors[0]} leads the dispossessed against their masters.`,
      `What begins as protest turns to open rebellion.`
    ],
    outcomes: [
      "The rebellion is crushed. Examples are made.",
      "The old order is swept away.",
      "Concessions buy temporary peace.",
      "The rebels win, then turn on each other.",
      "Outside powers intervene for their own ends."
    ]
  },
  {
    type: "duel",
    titles: ["The %LOCATION% Duel", "Dawn and Steel", "Honor Demands Blood", "Seconds and Swords"],
    summaries: (actors, location) => [
      `${actors[0]} challenges ${actors[1] ?? "a rival"} to single combat.`,
      `Honor can only be satisfied with blood. ${location} will witness.`
    ],
    outcomes: [
      "The challenger prevails.",
      "The defender proves the stronger.",
      "Both combatants fall.",
      "Interference stops the duel—honor unsatisfied.",
      "First blood ends it; mutual respect grows."
    ]
  },
  {
    type: "raid",
    titles: ["Fire in %LOCATION%", "The %ACTOR% Raid", "Strike and Vanish", "Burning Dawn"],
    summaries: (actors, location) => [
      `${actors[0]} strikes fast at ${location} and withdraws before retaliation.`,
      `Hit and run tactics terrorize ${location}.`
    ],
    outcomes: [
      "The raid succeeds with heavy plunder.",
      "The raiders are intercepted and destroyed.",
      "The raid escalates into open war.",
      "The raiders demand tribute to stop."
    ]
  },
  {
    type: "mystery",
    titles: ["The %LOCATION% Mystery", "Secrets of %ACTOR%", "What Lurks Beneath", "Strange Happenings"],
    summaries: (actors, location) => [
      `Strange events in ${location} demand explanation.`,
      `${actors[0]} uncovers clues to something best left buried.`,
      `Every answer raises three more questions.`
    ],
    outcomes: [
      "The truth is revealed—and it's worse than imagined.",
      "The mystery remains unsolved; some doors are better left closed.",
      "A hidden conspiracy is exposed.",
      "The investigation claims lives before answers emerge.",
      'The "mystery" was an elaborate distraction.'
    ]
  },
  {
    type: "treasure",
    titles: ["The %LOCATION% Hoard", "%ACTOR%'s Fortune", "Riches and Ruin", "Gold Fever"],
    summaries: (actors, location) => [
      `Word of treasure in ${location} draws fortune-seekers.`,
      `${actors[0]} races rivals to claim the prize.`,
      `Greed poisons every alliance. Trust no one.`
    ],
    outcomes: [
      "The treasure is claimed. Wealth flows.",
      "The treasure was cursed. Misfortune follows.",
      "The treasure was a trap. Bodies pile up.",
      "The treasure proves smaller than legend suggested.",
      "The true treasure was knowledge, not gold."
    ]
  },
  {
    type: "prophecy",
    titles: ["The Foretelling", "Signs and Portents", "What Was Written", "The Chosen One"],
    summaries: (actors, location) => [
      `Ancient prophecy stirs. ${actors[0]} may be the key.`,
      `The seers spoke of ${location}. The time is now.`,
      `Those who would prevent destiny clash with those who would fulfill it.`
    ],
    outcomes: [
      "The prophecy is fulfilled as foretold.",
      "The prophecy is averted at great cost.",
      "The prophecy was misinterpreted all along.",
      "The prophecy was a lie—or a test.",
      "Multiple claimants fight over the prophetic role."
    ]
  },
  {
    type: "expedition",
    titles: ["Into the Unknown", "The %LOCATION% Expedition", "Beyond the Map", "First Footsteps"],
    summaries: (actors, location) => [
      `${actors[0]} ventures where none have gone before.`,
      `The blank spaces on the map call to the bold.`,
      `What wonders—or horrors—await in ${location}?`
    ],
    outcomes: [
      "New lands are claimed. History is made.",
      "The expedition vanishes without trace.",
      "They return changed—but refuse to speak of what they saw.",
      "Something followed them back.",
      "The discovery reshapes the political landscape."
    ]
  },
  {
    type: "artifact",
    titles: ["The %ACTOR% Blade", "Quest for the %LOCATION% Crown", "Legendary Arms", "The Lost Relic"],
    summaries: (actors, location) => [
      `A legendary artifact has surfaced near ${location}.`,
      `${actors[0]} seeks a weapon of terrible power.`,
      `Whoever claims the relic may tip the balance of power.`
    ],
    outcomes: [
      "The artifact is claimed and its power unleashed.",
      "The artifact proves too dangerous and is destroyed.",
      "The artifact chooses its own wielder.",
      "The artifact was fake—the real one remains hidden.",
      "Multiple fragments must be reunited."
    ]
  },
  {
    type: "lost-heir",
    titles: ["The Hidden Bloodline", "Rightful Heir of %LOCATION%", "A Crown Unclaimed", "Blood Will Tell"],
    summaries: (actors, location) => [
      `Someone in ${location} carries royal blood unknowingly.`,
      `${actors[0]} may be heir to more than they know.`,
      `Birthmarks, signet rings, dying confessions—the truth emerges.`
    ],
    outcomes: [
      "The heir claims their birthright.",
      "The heir rejects the throne for a simpler life.",
      "The heir is assassinated before the claim is made.",
      "The bloodline proves to be a fabrication.",
      "Multiple heirs emerge, each with valid claims."
    ]
  },
  {
    type: "ancient-evil",
    titles: ["The Awakening", "What Sleeps Beneath %LOCATION%", "The Old Darkness Returns", "Seals Breaking"],
    summaries: (actors, location) => [
      `Something sealed away long ago stirs in ${location}.`,
      `Ancient wards fail. What they imprisoned walks again.`,
      `${actors[0]} races to prevent catastrophe.`
    ],
    outcomes: [
      "The evil is resealed, but weakened watchers remain.",
      "The evil is destroyed at tremendous cost.",
      "The evil proves to be misunderstood—not evil at all.",
      "The evil escapes and begins its conquest.",
      "A bargain is struck with the awakened power."
    ]
  },
  {
    type: "portal",
    titles: ["The Gate Opens", "Between Worlds", "The %LOCATION% Rift", "Doorway to Elsewhere"],
    summaries: (actors, location) => [
      `A portal has opened near ${location}. What comes through?`,
      `${actors[0]} discovers a gateway between realities.`,
      `Traffic flows both ways. Not all visitors are welcome.`
    ],
    outcomes: [
      "The portal is closed before disaster.",
      "An alliance forms across the threshold.",
      "Invasion pours through. Defense is mounted.",
      "Someone important is lost to the other side.",
      "The portal becomes a valuable trade route."
    ]
  },
  {
    type: "romance",
    titles: ["%ACTOR% and %ACTOR%", "Forbidden Love", "Hearts Entwined", "Against All Custom"],
    summaries: (actors, location) => [
      `Love blooms between ${actors[0]} and ${actors[1] ?? "an unlikely partner"}.`,
      `In ${location}, hearts conspire what politics would forbid.`
    ],
    outcomes: [
      "Love conquers all. They wed.",
      "Duty prevails over passion. Hearts break.",
      "One lover betrays the other.",
      "They elope, burning all bridges.",
      "Tragedy claims one; the other mourns forever."
    ]
  },
  {
    type: "rise",
    titles: ["The Rise of %ACTOR%", "From Nothing to Everything", "A Star Ascends", "The Climb"],
    summaries: (actors, location) => [
      `${actors[0]} is becoming someone to watch.`,
      `Power and fame gather around a rising figure in ${location}.`,
      `From humble origins, greatness emerges.`
    ],
    outcomes: [
      "They achieve their ambition and more.",
      "They overreach and crash down.",
      "They attract powerful enemies.",
      "They become what they once despised.",
      "They lift others as they climb."
    ]
  },
  {
    type: "fall",
    titles: ["The Fall of %ACTOR%", "How the Mighty Crumble", "Twilight", "The Last Days of %ACTOR%"],
    summaries: (actors, location) => [
      `${actors[0]}'s power wanes. Vultures circle.`,
      `What was once mighty in ${location} totters on the brink.`,
      `Allies become enemies. Friends become strangers.`
    ],
    outcomes: [
      "The fall is complete. Nothing remains.",
      "A desperate comeback succeeds.",
      "They fall, but take enemies with them.",
      "They accept their fate with grace.",
      "A loyal few stand with them to the end."
    ]
  },
  {
    type: "scandal",
    titles: ["The %LOCATION% Scandal", "Reputation in Ruins", "Whispers and Accusations", "Public Disgrace"],
    summaries: (actors, location) => [
      `${actors[0]}'s secret is about to become very public.`,
      `Accusations fly in ${location}. Someone's reputation will not survive.`,
      `The truth—or a convincing lie—threatens to destroy everything.`
    ],
    outcomes: [
      "The scandal proves true. Exile follows.",
      "The accusation is false, but mud sticks.",
      "The accuser is exposed as a fraud.",
      "A greater scandal eclipses the first.",
      "Brazening it out somehow works."
    ]
  },
  {
    type: "betrayal",
    titles: ["%ACTOR%'s Betrayal", "The Knife in the Back", "Trust Broken", "Et Tu?"],
    summaries: (actors, location) => [
      `${actors[0]} is betrayed by ${actors[1] ?? "someone trusted"}.`,
      `In ${location}, a trusted ally reveals their true allegiance.`,
      `The betrayal cuts deep. Nothing will be the same.`
    ],
    outcomes: [
      "The betrayer succeeds completely.",
      "The betrayal is discovered just in time.",
      "Both betrayer and betrayed are destroyed.",
      "The betrayer has a change of heart.",
      "It was a test of loyalty all along."
    ]
  },
  {
    type: "succession",
    titles: ["The %LOCATION% Succession", "Crown and Contenders", "Who Will Rule?", "The Empty Throne"],
    summaries: (actors, location) => [
      `With the ruler gone, ${location} needs a new leader.`,
      `Multiple claimants vie for power. ${actors[0]} makes their move.`,
      `Legitimacy, force, and cunning all have their advocates.`
    ],
    outcomes: [
      "The rightful heir prevails.",
      "The strongest claimant seizes power.",
      "Civil war erupts over the succession.",
      "An outside power dictates the succession.",
      "An unexpected candidate emerges victorious."
    ]
  },
  {
    type: "exile",
    titles: ["The Exile of %ACTOR%", "Cast Out", "No Home Remaining", "Wanderer's Road"],
    summaries: (actors, location) => [
      `${actors[0]} is banished from ${location}.`,
      `An exile begins. Where will they go? What will they become?`,
      `Behind, everything they knew. Ahead, only uncertainty.`
    ],
    outcomes: [
      "The exile finds a new home and purpose.",
      "The exile returns in triumph.",
      "The exile dies in obscurity.",
      "The exile builds power abroad and returns for vengeance.",
      "The exile is pardoned, but the scars remain."
    ]
  },
  {
    type: "redemption",
    titles: ["%ACTOR%'s Redemption", "The Road Back", "Atonement", "Second Chances"],
    summaries: (actors, location) => [
      `${actors[0]} seeks to atone for past sins.`,
      `In ${location}, someone fights to prove they have changed.`,
      `Can the past truly be escaped?`
    ],
    outcomes: [
      "Redemption is earned. The past is forgiven.",
      "Some sins cannot be forgiven. The quest fails.",
      "Redemption comes through sacrifice.",
      "The attempt at redemption is a deception.",
      "They save others but cannot save themselves."
    ]
  },
  {
    type: "rescue",
    titles: ["The Rescue of %ACTOR%", "Into the %LOCATION%", "Against All Odds", "Every Hour Counts"],
    summaries: (actors, location) => [
      `${actors[1] ?? "Someone important"} has been taken. ${actors[0]} must act.`,
      `A desperate mission into ${location} begins.`,
      `Time is running out for the captive.`
    ],
    outcomes: [
      "The captive is saved, battered but alive.",
      "The rescue comes too late.",
      "The captive is rescued, but at terrible cost.",
      "The captor is defeated; the captive was bait.",
      "The captive rescues themselves before help arrives."
    ]
  },
  {
    type: "plague",
    titles: ["The %LOCATION% Plague", "Death Walks", "The Spreading Sickness", "Quarantine"],
    summaries: (actors, location) => [
      `A deadly sickness sweeps through ${location}.`,
      `The sick are shunned. The healthy live in fear.`,
      `${actors[0]} races to find a cure—or a cause.`
    ],
    outcomes: [
      "A cure is found. The plague ends.",
      "The plague burns itself out—but at terrible cost.",
      "The plague spreads to new regions.",
      "The plague proves to be deliberate.",
      "Immunity emerges among survivors."
    ]
  },
  {
    type: "famine",
    titles: ["The Hungry Year", "Empty Granaries of %LOCATION%", "When Harvests Fail", "Starvation Stalks"],
    summaries: (actors, location) => [
      `Famine grips ${location}. The people starve.`,
      `Food becomes more precious than gold.`,
      `${actors[0]} seeks supplies—by any means necessary.`
    ],
    outcomes: [
      "Aid arrives from unexpected quarters.",
      "The famine claims countless lives.",
      "Hoarded food is discovered and redistributed.",
      "The famine drives mass migration.",
      "The famine proves to be engineered."
    ]
  },
  {
    type: "migration",
    titles: ["The Great Migration", "Exodus from %LOCATION%", "A People in Motion", "The Long March"],
    summaries: (actors, location) => [
      `A great movement of people—or creatures—passes through ${location}.`,
      `${actors[0]} leads their people to a new home.`,
      `Everything is changing. The old order crumbles.`
    ],
    outcomes: [
      "The migrants find a new home.",
      "The migrants are turned back or destroyed.",
      "The migration destabilizes multiple regions.",
      "The migrants conquer rather than settle.",
      "Integration proves possible, if difficult."
    ]
  },
  {
    type: "sanctuary",
    titles: ["Sanctuary", "The Last Refuge", "Safe Harbor", "Walls Against the Dark"],
    summaries: (actors, location) => [
      `${location} is the last safe place—and it is threatened.`,
      `${actors[0]} fights to protect those who cannot protect themselves.`,
      `If this place falls, there is nowhere left to go.`
    ],
    outcomes: [
      "The sanctuary holds. The threat is repelled.",
      "The sanctuary falls. Refugees scatter.",
      "The threat is revealed to come from within.",
      "The sanctuary is saved, but forever changed.",
      "A new, safer sanctuary is found."
    ]
  },
  {
    type: "curse",
    titles: ["The %LOCATION% Curse", "Doom Upon %ACTOR%", "The Witch's Word", "Malediction"],
    summaries: (actors, location) => [
      `A curse has fallen upon ${location}—or upon ${actors[0]}.`,
      `The terms of breaking the curse seem impossible.`,
      `Day by day, the curse tightens its grip.`
    ],
    outcomes: [
      "The curse is broken. Freedom restored.",
      "The curse claims its victim.",
      "The curse is transferred to another.",
      "The curse proves to be a blessing in disguise.",
      "Living with the curse proves manageable."
    ]
  },
  {
    type: "hunt-survival",
    titles: ["The Hunted", "%ACTOR% Runs", "No Escape", "Prey"],
    summaries: (actors, location) => [
      `${actors[0]} is being hunted through ${location}.`,
      `Pursuers close in from all sides. Escape seems impossible.`,
      `Every shadow could hide a hunter.`
    ],
    outcomes: [
      "The hunted escapes against all odds.",
      "The hunted turns the tables on their pursuers.",
      "The hunted is captured or killed.",
      "The hunted finds unexpected allies.",
      "The hunt reveals a larger conspiracy."
    ]
  },
  {
    type: "conspiracy",
    titles: ["The %LOCATION% Conspiracy", "Plots and Shadows", "They Are Everywhere", "The Hidden Hand"],
    summaries: (actors, location) => [
      `A conspiracy reaches into the heart of ${location}.`,
      `${actors[0]} stumbles onto a plot that reaches the highest levels.`,
      `Trust no one. Anyone could be part of it.`
    ],
    outcomes: [
      "The conspiracy is exposed and destroyed.",
      "The conspiracy succeeds in its goals.",
      "The conspiracy is real—but not what it seemed.",
      "Exposing the conspiracy proves impossible.",
      "The conspirators are played by a greater power."
    ]
  },
  {
    type: "heist",
    titles: ["The %LOCATION% Job", "The Perfect Crime", "One Last Score", "Into the Vault"],
    summaries: (actors, location) => [
      `${actors[0]} plans an audacious theft in ${location}.`,
      `The target is impregnable. The crew is ready.`,
      `Everything must go perfectly. Nothing ever does.`
    ],
    outcomes: [
      "The heist succeeds spectacularly.",
      "The heist fails—someone talks.",
      "The prize is claimed, but at unexpected cost.",
      "The heist was a setup all along.",
      "The crew turns on each other over the prize."
    ]
  },
  {
    type: "infiltration",
    titles: ["The Mole", "Enemy Among Us", "The %LOCATION% Spy", "Trust and Treachery"],
    summaries: (actors, location) => [
      `There is a spy in ${location}. But who?`,
      `${actors[0]} must identify the infiltrator before more damage is done.`,
      `Paranoia spreads. Old friends are suspected.`
    ],
    outcomes: [
      "The spy is caught and justice served.",
      "The spy escapes with critical secrets.",
      "The wrong person is accused. The real spy continues.",
      "The spy becomes a double agent.",
      "Everyone was spying on everyone else."
    ]
  },
  {
    type: "blackmail",
    titles: ["Secrets for Sale", "The %ACTOR% Letters", "What They Know", "Silence Has a Price"],
    summaries: (actors, location) => [
      `Someone has damaging information about ${actors[0]}.`,
      `In ${location}, secrets become currency.`,
      `Pay the price, or face exposure.`
    ],
    outcomes: [
      "The blackmailer is silenced.",
      "The victim pays and pays and pays.",
      "The secret is exposed—consequences follow.",
      "The blackmailer is blackmailed in turn.",
      "The secret turns out to be already known."
    ]
  },
  {
    type: "imposter",
    titles: ["The False %ACTOR%", "Who Are You Really?", "Stolen Identity", "The Pretender"],
    summaries: (actors, location) => [
      `Someone in ${location} is not who they claim to be.`,
      `${actors[0]} suspects an imposter—but can they prove it?`,
      `The deception runs deep. Even memories lie.`
    ],
    outcomes: [
      "The imposter is exposed dramatically.",
      "The imposter achieves their goal before discovery.",
      "The imposter becomes the role they played.",
      'The "imposter" is actually the real person.',
      "Multiple imposters complicate everything."
    ]
  },
  {
    type: "cult",
    titles: ["The Hidden Church", "Dark Devotion", "The %LOCATION% Cult", "Forbidden Worship"],
    summaries: (actors, location) => [
      `A secret cult spreads its influence through ${location}.`,
      `${actors[0]} uncovers unsettling rituals and darker plans.`,
      `How many are already members? The answer terrifies.`
    ],
    outcomes: [
      "The cult is destroyed root and branch.",
      "The cult achieves its apocalyptic goal.",
      "The cult is contained but not eliminated.",
      "The cult's beliefs prove to be valid.",
      "The cult fractures into warring sects."
    ]
  },
  {
    type: "haunting",
    titles: ["The %LOCATION% Haunting", "Unquiet Dead", "What Lingers", "Echoes of the Past"],
    summaries: (actors, location) => [
      `The dead do not rest peacefully in ${location}.`,
      `${actors[0]} confronts spirits who refuse to pass on.`,
      `What do the ghosts want? What will make them stop?`
    ],
    outcomes: [
      "The spirits are laid to rest.",
      "The haunting intensifies to lethal levels.",
      "Coexistence is negotiated.",
      "The ghosts reveal crucial information.",
      'The "haunting" proves to have mortal origins.'
    ]
  },
  {
    type: "possession",
    titles: ["Not Themselves", "The Thing Inside", "Stolen Mind", "The Possession of %ACTOR%"],
    summaries: (actors, location) => [
      `Something has taken control of ${actors[0]}.`,
      `In ${location}, a trusted person acts with another's will.`,
      `Can the possession be broken before irrevocable harm is done?`
    ],
    outcomes: [
      "The possession is ended. The host recovers.",
      "The host is destroyed to stop the possessor.",
      "The possessor is bargained with.",
      "The host willingly surrendered control.",
      "The possessor and host merge into something new."
    ]
  },
  {
    type: "transformation",
    titles: ["Becoming", "%ACTOR%'s Change", "What I Am Now", "Metamorphosis"],
    summaries: (actors, location) => [
      `${actors[0]} is changing into something else.`,
      `In ${location}, a transformation beyond medicine unfolds.`,
      `Can the change be stopped? Should it be?`
    ],
    outcomes: [
      "The transformation is reversed.",
      "The transformation completes. A new creature exists.",
      "The transformation is embraced.",
      "The transformation can be controlled.",
      "The transformation spreads to others."
    ]
  },
  {
    type: "pact",
    titles: ["The Bargain", "What Was Promised", "Payment Due", "The %ACTOR% Compact"],
    summaries: (actors, location) => [
      `${actors[0]} made a deal with powers best left alone.`,
      `In ${location}, ancient bargains come due.`,
      `The terms seemed fair once. They do not seem fair now.`
    ],
    outcomes: [
      "The pact is fulfilled as agreed.",
      "A loophole is found. The pact is broken.",
      "The pact-maker pays the full price.",
      "The terms are renegotiated at great cost.",
      "The other party to the pact is destroyed."
    ]
  },
  {
    type: "rift",
    titles: ["The Tear in Reality", "Where Worlds Touch", "The %LOCATION% Rift", "Bleeding Through"],
    summaries: (actors, location) => [
      `Reality itself is wounded near ${location}.`,
      `Strange things leak through. The boundaries fail.`,
      `${actors[0]} must seal the rift—or exploit it.`
    ],
    outcomes: [
      "The rift is sealed. Reality stabilizes.",
      "The rift expands. Multiple realities collide.",
      "The rift becomes permanent but manageable.",
      "Something crosses through that cannot be uncrossed.",
      "The rift proves to be a deliberate doorway."
    ]
  },
  {
    type: "awakening",
    titles: ["Power Manifest", "The Gift", "Something Awakens", "%ACTOR% Awakens"],
    summaries: (actors, location) => [
      `${actors[0]} discovers power within themselves.`,
      `In ${location}, latent abilities surge to life.`,
      `With power comes fear—from others and from within.`
    ],
    outcomes: [
      "The power is mastered and used for good.",
      "The power proves uncontrollable.",
      "Others seek to claim or destroy the awakened one.",
      "The awakening spreads to others.",
      "The power fades as mysteriously as it came."
    ]
  }
];
function generateStoryThread(rng, type, actors, location, worldTime, triggeringSummary) {
  const template = STORY_TEMPLATES.find((t) => t.type === type) ?? STORY_TEMPLATES[0];
  let title = rng.pick(template.titles);
  title = title.replace("%ACTOR%", actors[0] ?? "Someone");
  title = title.replace("%ACTOR%", actors[1] ?? actors[0] ?? "Someone");
  title = title.replace("%LOCATION%", location);
  const summaryOptions = template.summaries(actors, location);
  const summary = rng.pick(summaryOptions);
  return {
    id: `story-${Date.now()}-${rng.int(1e4)}`,
    type,
    title,
    summary,
    phase: "inciting",
    actors,
    location,
    startedAt: worldTime,
    lastUpdated: worldTime,
    tension: 1,
    beats: [
      {
        timestamp: worldTime,
        summary: triggeringSummary,
        tensionChange: 1
      }
    ],
    potentialOutcomes: template.outcomes,
    resolved: false
  };
}
function addStoryBeat(story, summary, tensionChange, worldTime) {
  story.beats.push({
    timestamp: worldTime,
    summary,
    tensionChange
  });
  story.tension = Math.max(0, Math.min(10, story.tension + tensionChange));
  story.lastUpdated = worldTime;
  if (story.tension >= 8 && story.phase !== "climax") {
    story.phase = "climax";
  } else if (story.tension >= 5 && story.phase === "inciting") {
    story.phase = "rising";
  }
}
function resolveStory(rng, story, worldTime) {
  const resolution = rng.pick(story.potentialOutcomes);
  story.resolved = true;
  story.resolution = resolution;
  story.phase = "aftermath";
  story.lastUpdated = worldTime;
  addStoryBeat(story, `Resolution: ${resolution}`, 0, worldTime);
  return resolution;
}
function checkForStorySpawn(event, world, rng, activeStories) {
  const unresolvedCount = activeStories.filter((s) => !s.resolved).length;
  if (unresolvedCount >= 8)
    return null;
  const summary = event.summary.toLowerCase();
  const details = (event.details ?? "").toLowerCase();
  const actors = event.actors ?? [];
  const location = event.location ?? "the region";
  let storyType = null;
  let storyChance = 0;
  if (summary.includes("ambush") || summary.includes("clash") || summary.includes("battle")) {
    if (summary.includes("defeat") || summary.includes("driven back")) {
      storyType = "revenge";
      storyChance = 0.15;
    } else if (actors.length >= 2) {
      storyType = "feud";
      storyChance = 0.1;
    }
  }
  if (summary.includes("siege") || summary.includes("surround") || summary.includes("blockade")) {
    storyType = "siege";
    storyChance = 0.25;
  }
  if (summary.includes("uprising") || summary.includes("rebel") || summary.includes("revolt") || summary.includes("riot")) {
    storyType = "rebellion";
    storyChance = 0.2;
  }
  if (summary.includes("duel") || summary.includes("challenge") || summary.includes("honor demands")) {
    storyType = "duel";
    storyChance = 0.3;
  }
  if (summary.includes("raid") || summary.includes("plunder") || summary.includes("strike") && summary.includes("withdraw")) {
    storyType = "raid";
    storyChance = 0.15;
  }
  if (summary.includes("discover") || summary.includes("uncover") || summary.includes("find")) {
    if (summary.includes("artifact") || summary.includes("legendary") || summary.includes("ancient weapon")) {
      storyType = "artifact";
      storyChance = 0.25;
    } else if (summary.includes("treasure") || summary.includes("gold") || summary.includes("hoard")) {
      storyType = "treasure";
      storyChance = 0.2;
    } else if (summary.includes("heir") || summary.includes("bloodline") || summary.includes("birthright")) {
      storyType = "lost-heir";
      storyChance = 0.25;
    } else {
      storyType = "mystery";
      storyChance = 0.1;
    }
  }
  if (summary.includes("expedition") || summary.includes("explore") || summary.includes("uncharted")) {
    storyType = "expedition";
    storyChance = 0.2;
  }
  if (summary.includes("awaken") || summary.includes("stir") || summary.includes("seal") || summary.includes("ancient evil")) {
    storyType = "ancient-evil";
    storyChance = 0.2;
  }
  if (summary.includes("portal") || summary.includes("rift") || summary.includes("gateway") || summary.includes("tear in reality")) {
    storyType = "portal";
    storyChance = 0.25;
  }
  if (summary.includes("prophecy") || summary.includes("foretold") || summary.includes("chosen") || summary.includes("omen")) {
    storyType = "prophecy";
    storyChance = 0.15;
  }
  if (summary.includes("renown") || summary.includes("famous") || summary.includes("hailed") || summary.includes("celebrated")) {
    storyType = "rise";
    storyChance = 0.15;
  }
  if (summary.includes("disgrace") || summary.includes("ruined") || summary.includes("downfall") || summary.includes("stripped of")) {
    storyType = "fall";
    storyChance = 0.15;
  }
  if (summary.includes("scandal") || summary.includes("exposed") || summary.includes("shame") || summary.includes("accused")) {
    storyType = "scandal";
    storyChance = 0.2;
  }
  if (summary.includes("betray") || summary.includes("treacher") || summary.includes("turned against")) {
    storyType = "betrayal";
    storyChance = 0.2;
  }
  if (summary.includes("succession") || summary.includes("heir") || summary.includes("throne") || summary.includes("death") && summary.includes("lord")) {
    storyType = "succession";
    storyChance = 0.2;
  }
  if (summary.includes("exile") || summary.includes("banish") || summary.includes("cast out")) {
    storyType = "exile";
    storyChance = 0.2;
  }
  if (summary.includes("love") || summary.includes("court") || summary.includes("wed") || summary.includes("affair")) {
    storyType = "romance";
    storyChance = 0.12;
  }
  if (summary.includes("threat") || summary.includes("danger") || summary.includes("monster")) {
    storyType = "hunt";
    storyChance = 0.15;
  }
  if (summary.includes("faction") && (summary.includes("conflict") || summary.includes("tension") || summary.includes("war"))) {
    storyType = "war";
    storyChance = 0.08;
  }
  if (summary.includes("missing") || summary.includes("taken") || summary.includes("captive") || summary.includes("kidnap")) {
    storyType = "rescue";
    storyChance = 0.2;
  }
  if (summary.includes("plague") || summary.includes("sickness") || summary.includes("disease") || summary.includes("epidemic")) {
    storyType = "plague";
    storyChance = 0.2;
  }
  if (summary.includes("famine") || summary.includes("starv") || summary.includes("hunger") || summary.includes("crop fail")) {
    storyType = "famine";
    storyChance = 0.2;
  }
  if (summary.includes("migration") || summary.includes("exodus") || summary.includes("flee") || summary.includes("refugee")) {
    storyType = "migration";
    storyChance = 0.15;
  }
  if (summary.includes("curse") || summary.includes("hex") || summary.includes("malediction") || summary.includes("blighted")) {
    storyType = "curse";
    storyChance = 0.2;
  }
  if (summary.includes("hunted") || summary.includes("pursued") || summary.includes("on the run") || summary.includes("flee")) {
    if (storyType !== "migration") {
      storyType = "hunt-survival";
      storyChance = 0.15;
    }
  }
  if (summary.includes("conspiracy") || summary.includes("plot") || summary.includes("scheme") || summary.includes("cabal")) {
    storyType = "conspiracy";
    storyChance = 0.2;
  }
  if (summary.includes("heist") || summary.includes("rob") || summary.includes("steal") || summary.includes("vault")) {
    storyType = "heist";
    storyChance = 0.2;
  }
  if (summary.includes("spy") || summary.includes("infiltrat") || summary.includes("mole") || summary.includes("double agent")) {
    storyType = "infiltration";
    storyChance = 0.2;
  }
  if (summary.includes("blackmail") || summary.includes("extort") || summary.includes("secret") && summary.includes("threaten")) {
    storyType = "blackmail";
    storyChance = 0.18;
  }
  if (summary.includes("imposter") || summary.includes("pretend") || summary.includes("false identity") || summary.includes("disguise")) {
    storyType = "imposter";
    storyChance = 0.2;
  }
  if (summary.includes("cult") || summary.includes("sect") || summary.includes("dark worship") || summary.includes("forbidden ritual")) {
    storyType = "cult";
    storyChance = 0.2;
  }
  if (summary.includes("haunt") || summary.includes("ghost") || summary.includes("spirit") || summary.includes("apparition")) {
    storyType = "haunting";
    storyChance = 0.18;
  }
  if (summary.includes("possess") || summary.includes("control") || summary.includes("not themselves") || details.includes("acting strangely")) {
    storyType = "possession";
    storyChance = 0.18;
  }
  if (summary.includes("transform") || summary.includes("changing") || summary.includes("becoming") || summary.includes("lycanthrop")) {
    storyType = "transformation";
    storyChance = 0.2;
  }
  if (summary.includes("pact") || summary.includes("bargain") || summary.includes("deal with") || summary.includes("contract")) {
    storyType = "pact";
    storyChance = 0.18;
  }
  if (summary.includes("rift") || summary.includes("tear") || summary.includes("reality") || summary.includes("dimension")) {
    storyType = "rift";
    storyChance = 0.2;
  }
  if (summary.includes("power manifest") || summary.includes("ability awaken") || summary.includes("gift emerges")) {
    storyType = "awakening";
    storyChance = 0.18;
  }
  if (!storyType || !rng.chance(storyChance)) {
    return null;
  }
  const existingSimilar = activeStories.find((s) => !s.resolved && s.type === storyType && s.actors.some((a) => actors.includes(a)));
  if (existingSimilar) {
    addStoryBeat(existingSimilar, event.summary, 1, event.worldTime);
    return null;
  }
  return generateStoryThread(rng, storyType, actors.length > 0 ? actors : [randomName(rng)], location, event.worldTime, event.summary);
}
function ensureDate(d) {
  if (d instanceof Date)
    return d;
  return new Date(d);
}
function tickStories(rng, stories, world, worldTime) {
  const logs = [];
  for (const story of stories) {
    if (story.resolved)
      continue;
    const lastUpdated = ensureDate(story.lastUpdated);
    const daysSinceUpdate = (worldTime.getTime() - lastUpdated.getTime()) / (24 * 60 * 60 * 1000);
    if (daysSinceUpdate >= 1 && rng.chance(0.2)) {
      const PROGRESSION_BEATS = {
        hunt: [
          "Tracks are found. The quarry draws near.",
          "A witness points the way.",
          "The hunter's patience wears thin.",
          "The quarry leaves a taunt. It's personal now."
        ],
        feud: [
          "Harsh words are exchanged publicly.",
          "An ally is subverted.",
          "Blood is spilled in a back alley.",
          "Neutral parties are forced to choose sides."
        ],
        revenge: [
          "The avenger moves closer.",
          "Old alliances are tested.",
          "The weight of vengeance grows heavier.",
          "The target learns they are being hunted."
        ],
        war: [
          "Skirmishes break out along the border.",
          "Diplomatic options narrow.",
          "The drums beat louder.",
          "Mercenaries arrive, choosing sides."
        ],
        siege: [
          "Supplies inside the walls dwindle.",
          "A sortie attempts to break the ring.",
          "Disease spreads among the besieged.",
          "Siege engines are brought into position."
        ],
        rebellion: [
          "Another village joins the uprising.",
          "The authorities respond with force.",
          "A charismatic leader emerges.",
          "Nobles flee the region."
        ],
        duel: [
          "Seconds negotiate the terms.",
          "One party attempts reconciliation.",
          "Rumors spread about the coming fight.",
          "Spectators gather to witness."
        ],
        raid: [
          "Scouts report enemy movements.",
          "Defenses are hastily reinforced.",
          "Fires on the horizon approach.",
          "Refugees flee ahead of the raiders."
        ],
        mystery: [
          "A new clue surfaces.",
          "Someone who knew too much falls silent.",
          "The pattern becomes clearer—and more disturbing.",
          "An old document reveals a connection."
        ],
        treasure: [
          "A rival expedition sets out.",
          "The map proves partially false.",
          "Greed begins to poison the company.",
          "Guardians of the treasure awaken."
        ],
        prophecy: [
          "Another sign manifests.",
          "Believers grow in number.",
          "The skeptics fall silent.",
          "Those who would prevent the prophecy act."
        ],
        expedition: [
          "The terrain becomes impassable.",
          "Strange landmarks appear as described.",
          "Supplies run dangerously low.",
          "Contact with home is lost."
        ],
        artifact: [
          "A fragment of the artifact is found.",
          "Another seeker enters the race.",
          "The artifact's location is narrowed down.",
          "Visions reveal the artifact's power."
        ],
        "lost-heir": [
          "Evidence of the bloodline surfaces.",
          "Enemies of the heir move to suppress the claim.",
          "The heir learns fragments of their history.",
          "Old servants remember the true lineage."
        ],
        "ancient-evil": [
          "Tremors shake the earth.",
          "Animals flee the area.",
          "The seals show signs of weakening.",
          "Dreams of darkness plague the populace."
        ],
        portal: [
          "Strange creatures emerge.",
          "The portal fluctuates in stability.",
          "Communication across the threshold begins.",
          "The other side sends an emissary."
        ],
        romance: [
          "A secret meeting is arranged.",
          "Jealousy rears its head.",
          "Families object to the union.",
          "A rival for affection appears."
        ],
        rise: [
          "Another triumph adds to the legend.",
          "Enemies begin to take notice.",
          "The price of success becomes apparent.",
          "Old allies are left behind."
        ],
        fall: [
          "Another supporter abandons ship.",
          "Debts come due.",
          "The vultures circle lower.",
          "Former rivals offer hollow sympathy."
        ],
        scandal: [
          "Whispers become open conversation.",
          "Evidence surfaces—real or fabricated.",
          "Allies distance themselves.",
          "Public condemnation begins."
        ],
        betrayal: [
          "Small inconsistencies are noticed.",
          "The betrayer grows bolder.",
          "Suspicion falls on the wrong person.",
          "The moment of truth approaches."
        ],
        succession: [
          "Alliances form behind each claimant.",
          "Legal scholars debate legitimacy.",
          "Gold changes hands to buy support.",
          "Assassination attempts multiply."
        ],
        exile: [
          "The exile finds temporary shelter.",
          "Messages from home bring mixed news.",
          "The exile's skills prove valuable abroad.",
          "Plots to return home form."
        ],
        redemption: [
          "A small act of kindness is noted.",
          "Old victims are confronted.",
          "The path proves harder than expected.",
          "A test of true change arrives."
        ],
        rescue: [
          "A ransom demand arrives.",
          "A rescue attempt fails.",
          "Hope dwindles with each passing day.",
          "The captive sends a secret message."
        ],
        plague: [
          "The sickness spreads.",
          "A cure is rumored.",
          "Quarantines prove inadequate.",
          "The source of the plague is suspected."
        ],
        famine: [
          "Rations are cut again.",
          "Hoarding is punished severely.",
          "The desperate turn to crime.",
          "Relief supplies are diverted."
        ],
        migration: [
          "The column stretches for miles.",
          "Local populations react with fear.",
          "Resources along the route are exhausted.",
          "Splinter groups break away."
        ],
        sanctuary: [
          "The defenses are tested.",
          "Supplies begin to run low.",
          "Tension rises between refugees.",
          "A spy is suspected within."
        ],
        curse: [
          "The symptoms worsen.",
          "Potential cures prove false.",
          "The origin of the curse is revealed.",
          "The price of lifting the curse becomes clear."
        ],
        "hunt-survival": [
          "Another narrow escape.",
          "Pursuers gain ground.",
          "A potential ally proves false.",
          "Exhaustion takes its toll."
        ],
        conspiracy: [
          "Another connection is discovered.",
          "A conspirator is identified.",
          "The scope proves larger than imagined.",
          "Counter-surveillance is detected."
        ],
        heist: [
          "The plan hits an unexpected snag.",
          "A crew member gets cold feet.",
          "Security is tighter than expected.",
          "The inside contact proves unreliable."
        ],
        infiltration: [
          "The spy narrows the suspects.",
          "False accusations fly.",
          "Trust erodes among allies.",
          "The spy grows careless."
        ],
        blackmail: [
          "Another payment is demanded.",
          "Evidence of the threat surfaces.",
          "The victim considers confession.",
          "A third party learns the secret."
        ],
        imposter: [
          "A small detail doesn't match.",
          "Someone who knew the real person arrives.",
          "The imposter makes a critical error.",
          "The truth becomes impossible to ignore."
        ],
        cult: [
          "New converts are recruited.",
          "Disturbing rituals are witnessed.",
          "The cult's true goal becomes clearer.",
          "Members in high places are revealed."
        ],
        haunting: [
          "The manifestations intensify.",
          "The ghost's identity is learned.",
          "Physical harm begins to occur.",
          "The unfinished business is understood."
        ],
        possession: [
          "The changes become more obvious.",
          "Loved ones notice something wrong.",
          "The possessor's goal becomes clear.",
          "Control slips in moments of stress."
        ],
        transformation: [
          "The changes spread.",
          "Control becomes more difficult.",
          "Others react with fear.",
          "The transformation offers unexpected benefits."
        ],
        pact: [
          "The terms are tested.",
          "The other party demands more.",
          "Escape clauses prove illusory.",
          "The final payment approaches."
        ],
        rift: [
          "The rift widens.",
          "Strange laws of physics apply near the tear.",
          "Something on the other side notices.",
          "Reality warps in unpredictable ways."
        ],
        awakening: [
          "The power manifests unexpectedly.",
          "Others sense the awakening.",
          "Control proves difficult.",
          "The source of the power is revealed."
        ]
      };
      const beat = rng.pick(PROGRESSION_BEATS[story.type] ?? PROGRESSION_BEATS.mystery);
      addStoryBeat(story, beat, 1, worldTime);
      logs.push({
        category: "faction",
        summary: `${story.title}: ${beat}`,
        details: story.summary,
        location: story.location,
        actors: story.actors,
        worldTime,
        realTime: new Date,
        seed: world.seed
      });
    }
    if (story.tension >= 10 || story.phase === "climax" && rng.chance(0.15)) {
      const resolution = resolveStory(rng, story, worldTime);
      logs.push({
        category: "faction",
        summary: `${story.title} concludes`,
        details: resolution,
        location: story.location,
        actors: story.actors,
        worldTime,
        realTime: new Date,
        seed: world.seed
      });
      queueConsequence({
        type: "settlement-change",
        triggerEvent: `${story.title} resolution`,
        turnsUntilResolution: 6,
        data: {
          settlementName: story.location,
          change: "mood-shift",
          magnitude: resolution.includes("success") || resolution.includes("achieved") ? 1 : -1
        },
        priority: 2
      });
    }
  }
  return logs;
}

// src/character.ts
function getSettlementName2(world, settlementId) {
  if (!world)
    return settlementId;
  const settlement = world.settlements.find((s) => s.id === settlementId);
  return settlement?.name ?? settlementId;
}
var TRAIT_POOL = [
  "ambitious",
  "cautious",
  "greedy",
  "honorable",
  "cruel",
  "charitable",
  "cowardly",
  "brave",
  "cunning",
  "naive",
  "pious",
  "skeptical",
  "loyal",
  "treacherous",
  "romantic",
  "pragmatic"
];
var BACKGROUND_POOL = [
  "noble-exile",
  "veteran-soldier",
  "escaped-slave",
  "disgraced-priest",
  "failed-merchant",
  "orphan-thief",
  "hedge-wizard",
  "wandering-bard",
  "reformed-bandit",
  "retired-adventurer",
  "foreign-exile",
  "guild-dropout",
  "farmhand-turned-guard",
  "shipwreck-survivor",
  "plague-orphan"
];
var MOTIVATION_POOL = [
  "wealth",
  "revenge",
  "power",
  "redemption",
  "knowledge",
  "love",
  "duty",
  "survival",
  "fame",
  "home",
  "justice",
  "freedom"
];
var QUIRKS = [
  "speaks in proverbs",
  "constantly counts coins",
  "never sits with back to door",
  "hums old war songs",
  "refuses to eat meat",
  "collects small bones",
  "always wears a lucky charm",
  "tells the same three stories",
  "trusts no one who smiles too easily",
  "prays before every meal",
  "sleeps with a blade in hand",
  "fears deep water",
  "cannot resist a wager",
  "speaks to animals as if they understand",
  "always knows which way is north",
  "never reveals their true name",
  "keeps a journal in cipher",
  "has recurring nightmares",
  "laughs at inappropriate moments",
  "quotes ancient philosophers"
];
var APPEARANCES = [
  "scarred face and knowing eyes",
  "surprisingly young features",
  "weathered hands that speak of hard labor",
  "an aristocratic bearing despite rough clothes",
  "a nervous tic in the left eye",
  "graying at the temples despite apparent youth",
  "missing two fingers on the left hand",
  "a limp from an old wound",
  "elaborate tattoos visible at wrist and neck",
  "eyes of mismatched color",
  "a brand mark, poorly concealed",
  "the bearing of one who has worn armor",
  "ink-stained fingers of a scholar",
  "calluses of a lifetime of sword work",
  "the cautious movements of one used to danger"
];
function generateCharacterDepth(rng, role) {
  const traitCount = 2 + rng.int(2);
  const traits = [];
  for (let i = 0;i < traitCount; i++) {
    const trait = rng.pick(TRAIT_POOL);
    if (!traits.includes(trait))
      traits.push(trait);
  }
  const background = rng.pick(BACKGROUND_POOL);
  const motivation = rng.pick(MOTIVATION_POOL);
  const secretMotivation = rng.chance(0.3) ? rng.pick(MOTIVATION_POOL) : undefined;
  const quirkCount = 1 + rng.int(3);
  const quirks = [];
  for (let i = 0;i < quirkCount; i++) {
    const q = rng.pick(QUIRKS);
    if (!quirks.includes(q))
      quirks.push(q);
  }
  return {
    traits,
    background,
    motivation,
    secretMotivation,
    relationships: [],
    memories: [],
    quirks
  };
}
function generateAppearance(rng) {
  return rng.pick(APPEARANCES);
}
function generateTitle(rng, role) {
  const TITLES = {
    merchant: ["Master", "Goodman", "Trader", "Merchant-Factor", "Chandler"],
    guard: ["Sergeant", "Corporal", "Watch-Captain", "Armsman", "Guardsman"],
    scout: ["Ranger", "Tracker", "Outrider", "Path-Finder", "Woods-Guide"],
    priest: ["Brother", "Sister", "Prior", "Vicar", "Acolyte", "Deacon"],
    bard: ["Minstrel", "Skald", "Troubadour", "Cantor", "Rhapsode"],
    laborer: ["Goodman", "Porter", "Dockhand", "Digger", "Hauler"]
  };
  return rng.pick(TITLES[role] ?? ["Citizen"]);
}
function createRelationship(rng, sourceNpc, targetNpc, world) {
  const types = ["rival", "ally", "enemy", "mentor", "student", "debtor", "creditor", "betrayer", "betrayed"];
  if (rng.chance(0.15))
    types.push("lover");
  if (rng.chance(0.1))
    types.push("kin");
  const type = rng.pick(types);
  const strength = 1 + rng.int(5);
  const homeName = getSettlementName2(world, sourceNpc.home);
  const HISTORY_TEMPLATES = {
    rival: [
      `Competed for the same position in ${homeName}.`,
      "An old grudge over a matter of honor.",
      "Both loved the same person, once."
    ],
    ally: [
      "Survived a dangerous journey together.",
      "Owe each other debts that gold cannot repay.",
      "Shared a cell, or a foxhole, or both."
    ],
    lover: [
      "A passion that scandalized the town.",
      "Met under strange circumstances; love was stranger still.",
      "Some say the affair still smolders."
    ],
    enemy: [
      `Blood spilled between them in ${homeName}.`,
      "Words were said that cannot be unsaid.",
      "Only one of them can have what they both want."
    ],
    mentor: [
      "Taught them everything worth knowing.",
      "Saw potential where others saw nothing.",
      "The old ways, passed down in secret."
    ],
    student: [
      "The most promising pupil in years.",
      "Still learning, still surprising.",
      "Will surpass the master, given time."
    ],
    debtor: [
      "Borrowed gold at the worst possible moment.",
      "The debt was financial; the cost was higher.",
      "Interest compounds, and so does resentment."
    ],
    creditor: [
      "Extended credit when no one else would.",
      "Expects repayment, with interest.",
      "Gold is owed, and gold will be had."
    ],
    kin: [
      "The family resemblance is unmistakable.",
      "Blood ties that neither can deny.",
      "Estranged, but kin nonetheless."
    ],
    betrayer: [
      "Sold them out for gold, or fear, or both.",
      "The knife came from behind, as always.",
      "Trust, once given, was spectacularly misplaced."
    ],
    betrayed: [
      "Still bears the scars of misplaced faith.",
      "Forgiveness is not forthcoming.",
      "Watches old friends with new suspicion."
    ]
  };
  return {
    targetId: targetNpc.id,
    targetName: targetNpc.name,
    type,
    strength,
    history: rng.pick(HISTORY_TEMPLATES[type])
  };
}
function seedRelationships(rng, npcs, world) {
  for (const npc of npcs) {
    if (!npc.depth)
      continue;
    const relationshipCount = 1 + rng.int(3);
    const candidates = npcs.filter((n) => n.id !== npc.id);
    for (let i = 0;i < relationshipCount && candidates.length > 0; i++) {
      const target = rng.pick(candidates);
      if (!target.depth)
        continue;
      if (npc.depth.relationships.some((r) => r.targetId === target.id))
        continue;
      const relationship = createRelationship(rng, npc, target, world);
      npc.depth.relationships.push(relationship);
      if (rng.chance(0.6)) {
        const RECIPROCAL = {
          rival: "rival",
          ally: "ally",
          lover: "lover",
          enemy: "enemy",
          mentor: "student",
          student: "mentor",
          debtor: "creditor",
          creditor: "debtor",
          kin: "kin",
          betrayer: "betrayed",
          betrayed: "betrayer"
        };
        target.depth.relationships.push({
          targetId: npc.id,
          targetName: npc.name,
          type: RECIPROCAL[relationship.type],
          strength: relationship.strength,
          history: relationship.history
        });
      }
    }
  }
}
function relationshipEvent(rng, npc, world, worldTime) {
  const depth = npc.depth;
  if (!depth || !depth.relationships.length)
    return null;
  const relationship = rng.pick(depth.relationships);
  const DRAMA = {
    rival: {
      summaries: [
        `${npc.name} and ${relationship.targetName} exchange pointed words`,
        `Old rivalry flares between ${npc.name} and ${relationship.targetName}`
      ],
      details: [
        "Neither would yield. The tension was palpable.",
        "Onlookers sensed violence in the air, barely held back."
      ]
    },
    ally: {
      summaries: [
        `${npc.name} and ${relationship.targetName} seen conferring`,
        `${npc.name} backs ${relationship.targetName} in public dispute`
      ],
      details: [
        "Old bonds proved their worth once again.",
        "Their alliance is noted—and envied—by others."
      ]
    },
    lover: {
      summaries: [
        `Whispers of ${npc.name} and ${relationship.targetName} meeting in secret`,
        `${npc.name} seen leaving ${relationship.targetName}'s lodgings at dawn`
      ],
      details: [
        "The affair continues, discretion be damned.",
        "Some say passion; others say scandal."
      ]
    },
    enemy: {
      summaries: [
        `${npc.name} barely avoids confrontation with ${relationship.targetName}`,
        `Violence threatened between ${npc.name} and ${relationship.targetName}`
      ],
      details: [
        "Blood may yet be spilled between them.",
        "The feud grows more dangerous by the day."
      ]
    },
    mentor: {
      summaries: [
        `${npc.name} instructs ${relationship.targetName}`,
        `${npc.name} takes ${relationship.targetName} under their wing`
      ],
      details: [
        "Wisdom passed from one generation to the next.",
        "The student shows promise—or perhaps stubborn foolishness."
      ]
    },
    student: {
      summaries: [
        `${npc.name} seeks guidance from ${relationship.targetName}`,
        `${npc.name} demonstrates new skills learned from ${relationship.targetName}`
      ],
      details: [
        "The lessons take root.",
        "Not every student surpasses the master, but hope remains."
      ]
    },
    debtor: {
      summaries: [
        `${npc.name} negotiates terms with creditor ${relationship.targetName}`,
        `${relationship.targetName} presses ${npc.name} for payment`
      ],
      details: [
        "Gold owed sits heavy on both parties.",
        "The debt strains whatever else exists between them."
      ]
    },
    creditor: {
      summaries: [
        `${npc.name} demands repayment from ${relationship.targetName}`,
        `${npc.name} grows impatient with ${relationship.targetName}'s excuses`
      ],
      details: [
        "Patience has limits, even for gold.",
        "The ledger must balance, one way or another."
      ]
    },
    kin: {
      summaries: [
        `${npc.name} meets with kinsman ${relationship.targetName}`,
        `Family business draws ${npc.name} and ${relationship.targetName} together`
      ],
      details: [
        "Blood calls to blood, for good or ill.",
        "Some family ties bind; others chafe."
      ]
    },
    betrayer: {
      summaries: [
        `${npc.name} avoids ${relationship.targetName}'s gaze in the market`,
        `${relationship.targetName} confronts ${npc.name} about old treachery`
      ],
      details: [
        "Guilt—or its absence—speaks loudly.",
        "Some betrayals can never be undone."
      ]
    },
    betrayed: {
      summaries: [
        `${npc.name} watches ${relationship.targetName} with cold eyes`,
        `${npc.name} speaks publicly of ${relationship.targetName}'s treachery`
      ],
      details: [
        "The wound festers still.",
        "Forgiveness is not in their nature."
      ]
    }
  };
  const drama = DRAMA[relationship.type];
  if (!drama)
    return null;
  const settlement = world.settlements.find((s) => s.name === npc.location);
  const isDangerous = settlement && (world.settlementStates?.[settlement.name]?.safety ?? 5) < 0;
  let summary = rng.pick(drama.summaries);
  let details = rng.pick(drama.details);
  if (isDangerous && rng.chance(0.5)) {
    details += ` Amidst the growing danger in ${npc.location}, their ${relationship.type} feels all the more pressing.`;
  }
  return {
    category: "town",
    summary,
    details,
    location: npc.location,
    actors: [npc.name, relationship.targetName],
    worldTime,
    realTime: new Date,
    seed: world.seed
  };
}
function deepenNPC(rng, npc) {
  const roleToClass = {
    guard: ["Fighter", "Dwarf", "Halfling"],
    priest: ["Cleric", "Elf"],
    scout: ["Thief", "Elf", "Halfling"],
    bard: ["Thief", "Magic-User"],
    merchant: ["Thief", "Fighter"],
    laborer: ["Fighter", "Dwarf"]
  };
  const charClass = rng.pick(roleToClass[npc.role] || ["Fighter"]);
  const level = 1 + rng.int(12);
  const deepNpc = {
    ...npc,
    class: charClass,
    level,
    xp: 0,
    spells: charClass === "Magic-User" || charClass === "Elf" || charClass === "Cleric" ? [] : undefined,
    depth: generateCharacterDepth(rng, npc.role),
    age: 18 + rng.int(50),
    title: generateTitle(rng, npc.role),
    appearance: generateAppearance(rng),
    secretsKnown: [],
    memories: [],
    agendas: [],
    morale: 0,
    loyalty: rng.chance(0.7) ? `faction-${rng.int(3)}` : undefined
  };
  if (deepNpc.spells) {
    if (charClass === "Magic-User" || charClass === "Elf") {
      deepNpc.spells = ["Read Magic", "Sleep", "Magic Missile"].slice(0, 1 + rng.int(2));
    } else if (charClass === "Cleric") {
      deepNpc.spells = ["Cure Light Wounds", "Protection from Evil"].slice(0, 1 + rng.int(2));
    }
  }
  if (deepNpc.level && deepNpc.level >= 9) {
    deepNpc.agendas.push({
      type: "stronghold",
      priority: 8,
      progress: rng.int(50),
      description: `Establish a seat of power`
    });
  }
  if (deepNpc.spells) {
    deepNpc.agendas.push({
      type: "research",
      priority: 5,
      progress: rng.int(30),
      description: `Unlock deeper magical secrets`
    });
  }
  return deepNpc;
}

// src/agency.ts
function tickNexuses(world, rng, worldTime) {
  const logs = [];
  for (const nexus of world.nexuses) {
    if (nexus.currentOwnerId) {
      const faction = world.factions.find((f) => f.id === nexus.currentOwnerId);
      const npc = world.npcs.find((n) => n.id === nexus.currentOwnerId);
      if (faction) {
        faction.wealth += nexus.intensity;
        const state = getFactionState(world, faction.id);
        state.power = Math.min(100, state.power + 1);
      } else if (npc) {
        const stronghold = world.strongholds.find((s) => s.ownerId === npc.id);
        if (stronghold)
          stronghold.treasury += nexus.intensity * 2;
      }
    } else {
      if (rng.chance(0.01)) {
        for (const faction of world.factions) {
          const state = getFactionState(world, faction.id);
          if (state.power >= 60 && !state.activeOperations.some((op) => op.target === nexus.name)) {
            state.activeOperations.push({
              id: `op-nexus-${Date.now()}`,
              type: "expansion",
              target: nexus.name,
              startedAt: worldTime,
              completesAt: new Date(worldTime.getTime() + 48 * 60 * 60 * 1000),
              participants: [],
              successChance: 0.5,
              resources: 100,
              secret: false,
              reason: `Claim the ${nexus.powerType} nexus ${nexus.name}`
            });
            logs.push({
              category: "faction",
              summary: `${faction.name} moves to claim ${nexus.name}`,
              details: `The ${nexus.powerType} energy of the nexus has drawn their attention. An expedition is sent.`,
              location: `hex:${nexus.location.q},${nexus.location.r}`,
              actors: [faction.name],
              worldTime,
              realTime: new Date,
              seed: world.seed
            });
          }
        }
      }
    }
  }
  if (worldTime.getUTCDate() === 1) {
    const allGoods = ["grain", "timber", "ore", "textiles", "salt", "fish", "livestock"];
    for (const faction of world.factions) {
      const state = getFactionState(world, faction.id);
      if (rng.chance(0.3)) {
        const needed = rng.pick(allGoods);
        if (!state.resourceNeeds.includes(needed)) {
          state.resourceNeeds.push(needed);
          logs.push({
            category: "faction",
            summary: `${faction.name} declares a shortage of ${needed}`,
            details: `Their stockpiles are low. They will seek ${needed} by any means necessary.`,
            worldTime,
            realTime: new Date,
            seed: world.seed
          });
        }
      }
    }
  }
  return logs;
}
function tickArmyRaising(world, rng, worldTime) {
  const logs = [];
  for (const faction of world.factions) {
    const fState = getFactionState(world, faction.id);
    const armyCount = world.armies.filter((a) => a.ownerId === faction.id).length;
    if (faction.wealth >= 200 && armyCount < 2 && rng.chance(0.1)) {
      const location = fState.territory.length > 0 ? rng.pick(fState.territory) : world.settlements[0].name;
      const newArmy = {
        id: `army-${faction.id}-${Date.now()}`,
        ownerId: faction.id,
        location,
        strength: 50 + rng.int(100),
        quality: 1 + rng.int(3),
        morale: 7 + rng.int(3),
        status: "idle",
        supplies: 100,
        supplyLineFrom: location,
        lastSupplied: worldTime
      };
      world.armies.push(newArmy);
      faction.wealth -= 200;
      logs.push({
        category: "faction",
        summary: `${faction.name} raises an army in ${location}`,
        details: `Standard-bearers and mercenaries flock to their banners. A force of ${newArmy.strength} troops is ready for war.`,
        location,
        actors: [faction.name],
        worldTime,
        realTime: new Date,
        seed: world.seed
      });
    }
  }
  for (const stronghold of world.strongholds) {
    if (!stronghold.constructionFinished)
      continue;
    const ownerArmy = world.armies.find((a) => a.ownerId === stronghold.ownerId);
    if (!ownerArmy && stronghold.treasury >= 500 && rng.chance(0.05)) {
      const owner = world.npcs.find((n) => n.id === stronghold.ownerId) || world.parties.find((p) => p.id === stronghold.ownerId);
      if (!owner)
        continue;
      const location = world.settlements.find((s) => s.coord.q === stronghold.location.q && s.coord.r === stronghold.location.r)?.name || `hex:${stronghold.location.q},${stronghold.location.r}`;
      const newArmy = {
        id: `army-${stronghold.ownerId}-${Date.now()}`,
        ownerId: stronghold.ownerId,
        location,
        strength: 20 + rng.int(40),
        quality: 3 + rng.int(4),
        morale: 9 + rng.int(2),
        status: "idle",
        supplies: 100,
        supplyLineFrom: location,
        lastSupplied: worldTime
      };
      world.armies.push(newArmy);
      stronghold.treasury -= 500;
      logs.push({
        category: "faction",
        summary: `${owner.name} musters a personal guard`,
        details: `Elite warriors are hired to defend ${stronghold.name}.`,
        location: newArmy.location,
        actors: [owner.name],
        worldTime,
        realTime: new Date,
        seed: world.seed
      });
    }
  }
  return logs;
}
function tickLevelUps(world, rng, worldTime) {
  const logs = [];
  for (const party of world.parties) {
    const xpPerLevel = 2000;
    const currentAvgLevel = Math.floor(party.members.reduce((sum, m) => sum + m.level, 0) / party.members.length);
    const targetXp = currentAvgLevel * xpPerLevel;
    if (party.xp >= targetXp && currentAvgLevel < 36) {
      for (const member of party.members) {
        member.level += 1;
        member.maxHp += 1 + rng.int(8);
        member.hp = member.maxHp;
      }
      logs.push({
        category: "road",
        summary: `${party.name} grows in power!`,
        details: `Through hardship and battle, the members of ${party.name} have reached level ${party.members[0].level}.`,
        location: party.location,
        actors: [party.name],
        worldTime,
        realTime: new Date,
        seed: world.seed
      });
      if (party.members[0].level === 9) {
        const state = getPartyState(world, party.id);
        if (!state.questLog.some((q) => q.type === "stronghold")) {
          state.questLog.push({
            id: `quest-stronghold-${Date.now()}`,
            type: "stronghold",
            target: party.location,
            reason: "Establish a permanent seat of power at name level",
            progress: 0
          });
        }
      }
    }
  }
  return logs;
}
function tickNPCAgency(world, rng, worldTime, antagonists, storyThreads) {
  const logs = [];
  for (const npc of world.npcs) {
    if (npc.alive === false)
      continue;
    const reactiveNpc = npc;
    if (reactiveNpc.agendas && reactiveNpc.agendas.length > 0 && rng.chance(0.05)) {
      const agenda = reactiveNpc.agendas.sort((a, b) => b.priority - a.priority)[0];
      const actionLogs = executeNPCAgenda(reactiveNpc, agenda, world, rng, worldTime, antagonists, storyThreads);
      logs.push(...actionLogs);
    }
    if (reactiveNpc.memories && reactiveNpc.memories.length > 0 && rng.chance(0.02)) {
      const significantMemories = reactiveNpc.memories.filter((m) => !m.acted && m.intensity >= 5);
      if (significantMemories.length > 0) {
        const memory = rng.pick(significantMemories);
        const memoryLog = generateMemoryNarrative(reactiveNpc, memory, world, rng, worldTime);
        if (memoryLog) {
          logs.push(memoryLog);
          memory.acted = true;
        }
      }
    }
  }
  for (const npc of world.npcs) {
    const reactiveNpc = npc;
    if (reactiveNpc.memories) {
      for (const memory of reactiveNpc.memories) {
        if (memory.intensity > 1) {
          memory.intensity -= 0.01;
        }
      }
      reactiveNpc.memories = reactiveNpc.memories.filter((m) => m.intensity >= 1);
    }
  }
  return logs;
}
function generateMemoryNarrative(npc, memory, world, rng, worldTime) {
  const MEMORY_SURFACES = {
    "was-betrayed": {
      summaries: [
        `${npc.name} speaks bitterly of ${memory.target ?? "old treachery"}`,
        `${npc.name}'s eyes darken at mention of ${memory.target ?? "the past"}`,
        `${npc.name} mutters about trust and betrayal`,
        `${npc.name} recalls the day ${memory.target ?? "someone"} turned on them`
      ],
      details: [
        "The wound has not healed. Perhaps it never will.",
        "Some betrayals cannot be forgiven, only avenged.",
        "The memory poisons every interaction.",
        "They trusted once. They will not make that mistake again."
      ]
    },
    "lost-loved-one": {
      summaries: [
        `${npc.name} visits the grave of ${memory.target ?? "the fallen"}`,
        `${npc.name} grows quiet when ${memory.target ?? "the dead"} is mentioned`,
        `${npc.name} lights a candle in memory of ${memory.target ?? "the departed"}`,
        `${npc.name} speaks of ${memory.target ?? "those gone"} with wet eyes`
      ],
      details: [
        "Grief does not fade; it only changes shape.",
        "The living must carry the dead with them.",
        "Some absences echo forever.",
        "They would give anything for one more conversation."
      ]
    },
    "was-saved": {
      summaries: [
        `${npc.name} speaks warmly of ${memory.target ?? "a savior"}`,
        `${npc.name} mentions the debt owed to ${memory.target ?? "their rescuer"}`,
        `${npc.name} offers a toast to ${memory.target ?? "absent friends"}`,
        `${npc.name} credits ${memory.target ?? "another"} with their survival`
      ],
      details: [
        "Some debts can never be repaid, only honored.",
        "Gratitude runs deeper than gold.",
        "They would die for the one who saved them.",
        "Every day since has been a gift."
      ]
    },
    "was-attacked": {
      summaries: [
        `${npc.name} tenses at mention of ${memory.target ?? "the attack"}`,
        `${npc.name} fingers an old scar thoughtfully`,
        `${npc.name} speaks of ${memory.target ?? "violence past"} with cold fury`,
        `${npc.name} recalls the assault by ${memory.target ?? "enemies"}`
      ],
      details: [
        "The body heals. The fear lingers.",
        "They will be ready next time.",
        "Violence begets violence, they know.",
        "The memory surfaces in every shadow."
      ]
    },
    "committed-violence": {
      summaries: [
        `${npc.name} stares at their hands, lost in thought`,
        `${npc.name} flinches at reminders of ${memory.target ?? "past violence"}`,
        `${npc.name} drinks to forget ${memory.target ?? "what they did"}`,
        `${npc.name} is haunted by what happened with ${memory.target ?? "the fallen"}`
      ],
      details: [
        "The weight of killing never lightens.",
        "Blood washes off hands, not conscience.",
        "They did what they had to do. They repeat it like a prayer.",
        "Some nights, the faces come back."
      ]
    },
    "fell-in-love": {
      summaries: [
        `${npc.name} watches ${memory.target ?? "someone"} from across the room`,
        `${npc.name} sighs at mention of ${memory.target ?? "their beloved"}`,
        `${npc.name} finds excuses to be near ${memory.target ?? "the one they love"}`,
        `${npc.name} blushes when ${memory.target ?? "a certain name"} is spoken`
      ],
      details: [
        "Love makes fools of the wise and cowards of the brave.",
        "Every glance speaks volumes, to those who listen.",
        "They burn with feelings they dare not name.",
        "The heart wants what the heart wants."
      ]
    },
    "was-rejected": {
      summaries: [
        `${npc.name} averts their eyes from ${memory.target ?? "the one who spurned them"}`,
        `${npc.name} bristles at mention of ${memory.target ?? "past heartbreak"}`,
        `${npc.name} nurses old wounds over ale`,
        `${npc.name} pretends not to care about ${memory.target ?? "that person"}`
      ],
      details: [
        "Rejection leaves scars that do not show.",
        "Love unreturned curdles into something else.",
        "They have not moved on. They may never.",
        "The sting fades. The memory does not."
      ]
    },
    "discovered-secret": {
      summaries: [
        `${npc.name} watches ${memory.target ?? "certain people"} with knowing eyes`,
        `${npc.name} hints at knowledge they should not possess`,
        `${npc.name} speaks in riddles about ${memory.target ?? "hidden truths"}`,
        `${npc.name} smiles when ${memory.target ?? "that matter"} is discussed`
      ],
      details: [
        "Knowledge is power—and danger.",
        "Some secrets are worth more than gold.",
        "They know. And soon, others might too.",
        "Information is the currency of the careful."
      ]
    },
    "committed-betrayal": {
      summaries: [
        `${npc.name} grows tense when ${memory.target ?? "the past"} is mentioned`,
        `${npc.name} avoids ${memory.target ?? "certain people"}`,
        `${npc.name} justifies old decisions to anyone who will listen`,
        `${npc.name} looks over their shoulder when ${memory.target ?? "that name"} comes up`
      ],
      details: [
        "Guilt is a heavy companion.",
        "They had their reasons. The reasons ring hollow now.",
        "The betrayed may yet learn the truth.",
        "Sleep does not come easy to traitors."
      ]
    },
    "witnessed-cruelty": {
      summaries: [
        `${npc.name} cannot forget what ${memory.target ?? "the cruel"} did`,
        `${npc.name} speaks of horrors witnessed in ${memory.location}`,
        `${npc.name} refuses to discuss ${memory.target ?? "that day"}`,
        `${npc.name} shudders at memories of ${memory.target ?? "evil"}`
      ],
      details: [
        "Some sights cannot be unseen.",
        "Evil has a face now. They know it well.",
        "The nightmares have not stopped.",
        "They will never be the same."
      ]
    },
    "witnessed-heroism": {
      summaries: [
        `${npc.name} tells tales of ${memory.target ?? "heroic deeds"}`,
        `${npc.name} recalls when ${memory.target ?? "a hero"} saved the day`,
        `${npc.name} still speaks of ${memory.target ?? "bravery"} with awe`,
        `${npc.name} holds ${memory.target ?? "the brave one"} as an example`
      ],
      details: [
        "True courage inspires for a lifetime.",
        "They saw what one person can do.",
        "Heroes are real. They witnessed one.",
        "The memory sustains them in dark times."
      ]
    },
    "was-insulted": {
      summaries: [
        `${npc.name} seethes at the memory of ${memory.target ?? "public humiliation"}`,
        `${npc.name} plots revenge against ${memory.target ?? "those who mocked"}`,
        `${npc.name} cannot forget the words of ${memory.target ?? "mockers"}`
      ],
      details: [
        "Pride is a wound that festers.",
        "Honor demands satisfaction.",
        "They will have their day."
      ]
    },
    "was-exiled": {
      summaries: [
        `${npc.name} dreams of ${memory.target ?? "their lost homeland"}`,
        `${npc.name} speaks wistfully of ${memory.target ?? "home"}`,
        `${npc.name} marks the anniversary of their exile`
      ],
      details: [
        "Home is where they cannot return.",
        "The exile plans their return—someday.",
        "Every stranger reminds them of what was lost."
      ]
    },
    "made-enemy": {
      summaries: [
        `${npc.name} speaks darkly of ${memory.target ?? "an enemy"}`,
        `${npc.name} warns others about ${memory.target ?? "a foe"}`,
        `${npc.name} keeps watch for ${memory.target ?? "enemies"}`
      ],
      details: [
        "They know who wishes them ill.",
        "Trust is earned. This one failed.",
        "The enmity will not be forgotten."
      ]
    },
    "made-friend": {
      summaries: [
        `${npc.name} speaks fondly of ${memory.target ?? "a friend"}`,
        `${npc.name} inquires after ${memory.target ?? "an ally"}`,
        `${npc.name} credits ${memory.target ?? "a companion"} for past support`
      ],
      details: [
        "True friends are rare treasures.",
        "They would stand with this one through anything.",
        "Some bonds are forged in fire."
      ]
    }
  };
  const narrativeSet = MEMORY_SURFACES[memory.category];
  if (!narrativeSet)
    return null;
  return {
    category: "town",
    summary: rng.pick(narrativeSet.summaries),
    details: rng.pick(narrativeSet.details),
    location: npc.location,
    actors: memory.target ? [npc.name, memory.target] : [npc.name],
    worldTime,
    realTime: new Date,
    seed: world.seed
  };
}
function executeNPCAgenda(npc, agenda, world, rng, worldTime, antagonists, storyThreads) {
  const logs = [];
  switch (agenda.type) {
    case "revenge": {
      if (!agenda.target)
        break;
      const targetNpc = world.npcs.find((n) => n.name === agenda.target);
      const targetParty = world.parties.find((p) => p.name === agenda.target);
      const targetAntagonist = antagonists.find((a) => a.name === agenda.target);
      if (targetNpc && targetNpc.location === npc.location && targetNpc.alive !== false) {
        if (rng.chance(0.3)) {
          const success = rng.chance(0.4);
          if (success) {
            targetNpc.alive = false;
            agenda.progress = 100;
            const deathEvent = {
              id: `npc-revenge-${Date.now()}`,
              type: "assassination",
              timestamp: worldTime,
              location: npc.location,
              actors: [npc.name],
              victims: [targetNpc.name],
              perpetrators: [npc.name],
              magnitude: 6,
              witnessed: rng.chance(0.5),
              data: { cause: "revenge" }
            };
            logs.push(...processWorldEvent(deathEvent, world, rng, antagonists, storyThreads));
            logs.push({
              category: "town",
              summary: `${npc.name} exacts revenge on ${targetNpc.name}`,
              details: `The ${npc.role} finally settles the score. ${targetNpc.name} lies dead.`,
              location: npc.location,
              actors: [npc.name, targetNpc.name],
              worldTime,
              realTime: new Date,
              seed: world.seed
            });
          } else {
            logs.push({
              category: "town",
              summary: `${npc.name} confronts ${targetNpc.name}`,
              details: `Harsh words are exchanged. The ${npc.role}'s vengeance must wait.`,
              location: npc.location,
              actors: [npc.name, targetNpc.name],
              worldTime,
              realTime: new Date,
              seed: world.seed
            });
            agenda.progress += 10;
          }
        }
      } else if (!targetNpc && !targetParty && !targetAntagonist) {
        agenda.priority -= 1;
        if (agenda.priority <= 0) {
          logs.push({
            category: "town",
            summary: `${npc.name} abandons their vendetta`,
            details: `The ${npc.role} can no longer find ${agenda.target}. The grudge fades.`,
            location: npc.location,
            actors: [npc.name],
            worldTime,
            realTime: new Date,
            seed: world.seed
          });
          npc.agendas = npc.agendas?.filter((a) => a !== agenda);
        }
      } else {
        if (rng.chance(0.1)) {
          let targetLocation = targetNpc?.location ?? targetParty?.location;
          if (targetLocation && targetLocation !== npc.location) {
            logs.push({
              category: "road",
              summary: `${npc.name} sets out hunting ${agenda.target}`,
              details: `The ${npc.role} leaves ${npc.location}, seeking their prey.`,
              location: npc.location,
              actors: [npc.name],
              worldTime,
              realTime: new Date,
              seed: world.seed
            });
            queueConsequence({
              type: "spawn-event",
              triggerEvent: `${npc.name}'s hunt`,
              turnsUntilResolution: 12 + rng.int(24),
              data: {
                category: "town",
                summary: `${npc.name} arrives in ${targetLocation}`,
                details: `The hunter draws closer to their quarry.`,
                location: targetLocation,
                actors: [npc.name]
              },
              priority: 3
            });
            agenda.progress += 20;
          }
        }
      }
      break;
    }
    case "ambition": {
      const settlement = world.settlements.find((s) => s.name === npc.location);
      if (settlement) {
        const state = getSettlementState(world, settlement.name);
        if (!state.rulerNpcId && npc.fame && npc.fame >= 5) {
          if (rng.chance(0.2)) {
            state.rulerNpcId = npc.id;
            agenda.progress = 100;
            logs.push({
              category: "town",
              summary: `${npc.name} claims leadership of ${settlement.name}`,
              details: `Through cunning and reputation, the ${npc.role} rises to power.`,
              location: settlement.name,
              actors: [npc.name],
              worldTime,
              realTime: new Date,
              seed: world.seed
            });
          }
        } else {
          npc.fame = (npc.fame ?? 0) + 1;
          agenda.progress += 10;
        }
      }
      break;
    }
    case "protection": {
      if (agenda.target) {
        const faction = world.factions.find((f) => f.focus === "martial");
        if (faction && rng.chance(0.3)) {
          const reactiveNpc = npc;
          reactiveNpc.loyalty = faction.id;
          agenda.progress += 30;
          logs.push({
            category: "faction",
            summary: `${npc.name} joins ${faction.name}`,
            details: `Seeking protection for ${agenda.target}, the ${npc.role} takes up arms with the faction.`,
            location: npc.location,
            actors: [npc.name, faction.name],
            worldTime,
            realTime: new Date,
            seed: world.seed
          });
        }
      }
      break;
    }
    case "greed": {
      const settlement = world.settlements.find((s) => s.name === npc.location);
      if (settlement) {
        if (rng.chance(0.1)) {
          const state = getSettlementState(world, settlement.name);
          if (rng.chance(0.3)) {
            state.unrest = Math.min(10, (state.unrest ?? 0) + 1);
            npc.reputation = Math.max(-3, npc.reputation - 1);
            agenda.progress += 20;
            logs.push({
              category: "town",
              summary: `Theft reported in ${settlement.name}`,
              details: `Suspicion falls on certain individuals. The ${npc.role} ${npc.name} is among them.`,
              location: settlement.name,
              worldTime,
              realTime: new Date,
              seed: world.seed
            });
          }
        }
      }
      break;
    }
    case "research": {
      if (npc.spells && rng.chance(0.2)) {
        if (npc.level && npc.level >= 7 && !npc.agendas.some((a) => a.type === "nexus")) {
          const nearestNexus = world.nexuses?.find((n) => !n.currentOwnerId);
          if (nearestNexus) {
            npc.agendas.push({
              type: "nexus",
              target: nearestNexus.id,
              priority: 9,
              progress: 0,
              description: `Claim control of the ${nearestNexus.name}`
            });
          }
        }
        const arcaneSpells = ["Detect Magic", "Shield", "Floating Disc", "Hold Portal", "Web", "Invisibility", "Fireball", "Lightning Bolt", "Fly"];
        const divineSpells = ["Detect Evil", "Hold Person", "Bless", "Speak with Animals", "Continual Light", "Striking", "Dispel Magic"];
        const pool = npc.class === "Magic-User" || npc.class === "Elf" ? arcaneSpells : divineSpells;
        const available = pool.filter((s) => !npc.spells.includes(s));
        if (available.length > 0) {
          const newSpell = rng.pick(available);
          npc.spells.push(newSpell);
          agenda.progress = 100;
          logs.push({
            category: "town",
            summary: `${npc.name} masters a new spell: ${newSpell}`,
            details: `After weeks of intense study and meditation, the ${npc.role} has unlocked new power.`,
            location: npc.location,
            actors: [npc.name],
            worldTime,
            realTime: new Date,
            seed: world.seed
          });
        }
      }
      break;
    }
    case "nexus": {
      if (agenda.target) {
        const nexus = world.nexuses?.find((n) => n.id === agenda.target);
        if (nexus) {
          agenda.progress += 0.5 + rng.next() * 0.5;
          if (agenda.progress >= 100) {
            nexus.currentOwnerId = npc.id;
            agenda.progress = 100;
            logs.push({
              category: "faction",
              summary: `${npc.name} claims the ${nexus.name}`,
              details: `Through long ritual and arcane mastery, the ${npc.role} has bound the ${nexus.powerType} power of the nexus to their own will.`,
              location: `hex:${nexus.location.q},${nexus.location.r}`,
              actors: [npc.name],
              worldTime,
              realTime: new Date,
              seed: world.seed
            });
            npc.fame = (npc.fame ?? 0) + 5;
          }
        }
      }
      break;
    }
    case "stronghold": {
      if (npc.level && npc.level >= 9) {
        agenda.progress += 0.02 + rng.next() * 0.03;
        if (agenda.progress >= 100) {
          const settlement = world.settlements.find((s) => s.name === npc.location);
          const location = settlement ? settlement.coord : { q: rng.int(world.width), r: rng.int(world.height) };
          const type = npc.class === "Magic-User" ? "Tower" : npc.class === "Cleric" ? "Temple" : npc.class === "Thief" ? "Hideout" : "Keep";
          const stronghold = {
            id: `stronghold-${npc.id}-${Date.now()}`,
            ownerId: npc.id,
            name: `${npc.name}'s ${type}`,
            location,
            type,
            level: 1,
            staff: 10 + rng.int(20),
            constructionFinished: true,
            treasury: 1000 + rng.int(2000),
            unrest: 0,
            population: 50 + rng.int(100),
            taxRate: 10
          };
          world.strongholds.push(stronghold);
          logs.push({
            category: "faction",
            summary: `${npc.name} completes their ${type}`,
            details: `A grand monument to their power. The ${type} rises over the landscape, attracting followers and rivals alike.`,
            location: npc.location,
            actors: [npc.name],
            worldTime,
            realTime: new Date,
            seed: world.seed
          });
          npc.title = npc.class === "Fighter" ? "Lord" : npc.class === "Magic-User" ? "Wizard" : npc.class === "Cleric" ? "Patriarch" : "Guildmaster";
          agenda.progress = 100;
        } else {
          if (rng.chance(0.1)) {
            logs.push({
              category: "town",
              summary: `Construction continues on ${npc.name}'s stronghold`,
              details: `Masons and laborers work tirelessly. The foundations are deep and the walls rise.`,
              location: npc.location,
              actors: [npc.name],
              worldTime,
              realTime: new Date,
              seed: world.seed
            });
          }
        }
      }
      break;
    }
    case "romance": {
      if (!agenda.target)
        break;
      const targetNpc = world.npcs.find((n) => n.name === agenda.target);
      if (targetNpc && targetNpc.location === npc.location && targetNpc.alive !== false) {
        if (rng.chance(0.2)) {
          agenda.progress += 2 + rng.next() * 3;
          logs.push({
            category: "town",
            summary: `${npc.name} seeks the company of ${targetNpc.name}`,
            details: `A quiet walk in the market, a shared meal... the bond between them grows stronger.`,
            location: npc.location,
            actors: [npc.name, targetNpc.name],
            worldTime,
            realTime: new Date,
            seed: world.seed
          });
          if (agenda.progress >= 100) {
            logs.push({
              category: "town",
              summary: `${npc.name} and ${targetNpc.name} are wed`,
              details: `Against the backdrop of these uncertain times, love prevails. A celebration is held.`,
              location: npc.location,
              actors: [npc.name, targetNpc.name],
              worldTime,
              realTime: new Date,
              seed: world.seed
            });
          }
        }
      }
      break;
    }
    case "betrayal": {
      if (!agenda.target)
        break;
      const targetNpc = world.npcs.find((n) => n.name === agenda.target);
      if (targetNpc && targetNpc.location === npc.location && targetNpc.alive !== false) {
        if (rng.chance(0.1)) {
          agenda.progress += 0.3 + rng.next() * 0.4;
          if (agenda.progress >= 100) {
            const betrayalEvent = {
              id: `betrayal-${Date.now()}`,
              type: "betrayal",
              timestamp: worldTime,
              location: npc.location,
              actors: [npc.name],
              victims: [targetNpc.name],
              magnitude: 7,
              witnessed: rng.chance(0.4),
              data: { betrayer: npc.name, betrayed: targetNpc.name, nature: "political" }
            };
            logs.push(...processWorldEvent(betrayalEvent, world, rng, antagonists, storyThreads));
            npc.agendas = npc.agendas?.filter((a) => a !== agenda);
          } else {
            logs.push({
              category: "town",
              summary: `${npc.name} plots in shadows`,
              details: `The ${npc.role} was seen conferring with rivals of ${targetNpc.name}.`,
              location: npc.location,
              actors: [npc.name],
              worldTime,
              realTime: new Date,
              seed: world.seed
            });
          }
        }
      }
      break;
    }
  }
  return logs;
}
function tickPartyAgency(world, rng, worldTime, antagonists, storyThreads) {
  const logs = [];
  for (const party of world.parties) {
    if (party.status !== "idle")
      continue;
    if (party.restHoursRemaining && party.restHoursRemaining > 0)
      continue;
    const state = getPartyState(world, party.id);
    if (state.vendetta) {
      const target = findTarget(state.vendetta, world, antagonists);
      if (target) {
        const targetLocation = target.location;
        if (targetLocation && targetLocation !== party.location) {
          if (!party.goal || party.goal.target !== targetLocation) {
            party.goal = { kind: "travel-to", target: targetLocation };
            logs.push({
              category: "road",
              summary: `${party.name} tracks ${state.vendetta}`,
              details: `Their quarry was last seen near ${targetLocation}. The hunt continues.`,
              location: party.location,
              actors: [party.name, state.vendetta],
              worldTime,
              realTime: new Date,
              seed: world.seed
            });
          }
        } else if (targetLocation === party.location) {
          logs.push(...resolvePartyConfrontation(party, state, target, world, rng, worldTime, antagonists, storyThreads));
        }
      } else {
        if (state.killList?.includes(state.vendetta)) {
          logs.push({
            category: "town",
            summary: `${party.name} celebrates their victory`,
            details: `${state.vendetta} is no more. The vendetta is complete.`,
            location: party.location,
            actors: [party.name],
            worldTime,
            realTime: new Date,
            seed: world.seed
          });
          state.vendetta = undefined;
        }
      }
    }
    if (state.questLog?.length > 0) {
      const quest = state.questLog[0];
      if (quest.type === "stronghold") {
        const avgLevel = party.members.reduce((sum, m) => sum + m.level, 0) / party.members.length;
        if (avgLevel >= 9) {
          quest.progress += 0.02 + rng.next() * 0.03;
          if (quest.progress >= 100) {
            const stronghold = {
              id: `stronghold-${party.id}-${Date.now()}`,
              ownerId: party.id,
              name: `${party.name}'s Bastion`,
              location: world.settlements.find((s) => s.name === party.location)?.coord ?? { q: 0, r: 0 },
              type: "Keep",
              level: 1,
              staff: 20 + rng.int(30),
              constructionFinished: true,
              treasury: 5000,
              unrest: 0,
              population: 100 + rng.int(200),
              taxRate: 10
            };
            world.strongholds.push(stronghold);
            state.questLog = state.questLog.filter((q) => q.id !== quest.id);
            party.fame = (party.fame ?? 0) + 10;
            logs.push({
              category: "faction",
              summary: `${party.name} completes their stronghold!`,
              details: `The construction is finished. ${party.name} now rules from their own fortress.`,
              location: party.location,
              actors: [party.name],
              worldTime,
              realTime: new Date,
              seed: world.seed
            });
          } else {
            if (rng.chance(0.1)) {
              logs.push({
                category: "town",
                summary: `${party.name} oversees stronghold construction`,
                details: `Stone by stone, the bastion rises. Local workers are busy with the scaffolding.`,
                location: party.location,
                actors: [party.name],
                worldTime,
                realTime: new Date,
                seed: world.seed
              });
            }
          }
        }
      }
      if (quest.type === "hunt") {
        const target = findTarget(quest.target, world, antagonists);
        if (target) {
          if (target.location === party.location) {
            if (rng.chance(0.3)) {
              const success = rng.chance(0.5 + (party.fame ?? 0) * 0.05);
              if (success) {
                quest.progress = 100;
                state.killList = [...state.killList ?? [], quest.target];
                party.fame = (party.fame ?? 0) + 3;
                if ("alive" in target) {
                  target.alive = false;
                }
                logs.push({
                  category: "road",
                  summary: `${party.name} slays ${quest.target}!`,
                  details: `The quest is complete. ${quest.reason} - fulfilled at last.`,
                  location: party.location,
                  actors: [party.name, quest.target],
                  worldTime,
                  realTime: new Date,
                  seed: world.seed
                });
                const deathEvent = {
                  id: `quest-kill-${Date.now()}`,
                  type: "death",
                  timestamp: worldTime,
                  location: party.location,
                  actors: [party.name],
                  victims: [quest.target],
                  perpetrators: [party.name],
                  magnitude: 7,
                  witnessed: true,
                  data: { cause: "quest completion", killedBy: party.name }
                };
                logs.push(...processWorldEvent(deathEvent, world, rng, antagonists, storyThreads));
                state.questLog = state.questLog.filter((q) => q.id !== quest.id);
              } else {
                party.wounded = true;
                party.restHoursRemaining = 12 + rng.int(12);
                state.morale = Math.max(-10, (state.morale ?? 0) - 2);
                quest.progress = Math.max(0, quest.progress - 10);
                logs.push({
                  category: "road",
                  summary: `${party.name} driven back by ${quest.target}`,
                  details: `The foe proves too strong. They retreat to lick their wounds.`,
                  location: party.location,
                  actors: [party.name, quest.target],
                  worldTime,
                  realTime: new Date,
                  seed: world.seed
                });
              }
            }
          } else if (target.location) {
            party.goal = { kind: "travel-to", target: target.location };
          }
        }
      }
    }
    const nearbyAntagonists = antagonists.filter((a) => a.alive && a.territory === party.location);
    if (nearbyAntagonists.length > 0 && !state.vendetta && !party.goal) {
      const threat = rng.pick(nearbyAntagonists);
      const partyStrength = (party.fame ?? 0) + (state.morale ?? 0) / 2;
      if (partyStrength >= threat.threat) {
        state.vendetta = threat.name;
        state.questLog = state.questLog ?? [];
        state.questLog.push({
          id: `quest-${Date.now()}`,
          type: "hunt",
          target: threat.name,
          reason: `End the threat of ${threat.name} ${threat.epithet}`,
          progress: 0
        });
        logs.push({
          category: "road",
          summary: `${party.name} decides to confront ${threat.name}`,
          details: `${threat.name} ${threat.epithet}'s reign of terror must end. They prepare for battle.`,
          location: party.location,
          actors: [party.name, threat.name],
          worldTime,
          realTime: new Date,
          seed: world.seed
        });
      } else if (partyStrength < threat.threat - 3) {
        const safeHavens = world.settlements.filter((s) => s.name !== party.location && !antagonists.some((a) => a.territory === s.name && a.alive));
        if (safeHavens.length > 0) {
          const destination = rng.pick(safeHavens);
          party.goal = { kind: "travel-to", target: destination.name };
          logs.push({
            category: "road",
            summary: `${party.name} flees ${threat.name}'s territory`,
            details: `Discretion is the better part of valor. They make for ${destination.name}.`,
            location: party.location,
            actors: [party.name],
            worldTime,
            realTime: new Date,
            seed: world.seed
          });
        }
      }
    }
  }
  return logs;
}
function findTarget(name, world, antagonists) {
  const npc = world.npcs.find((n) => n.name === name);
  if (npc && npc.alive !== false)
    return { location: npc.location, alive: npc.alive };
  const party = world.parties.find((p) => p.name === name);
  if (party)
    return { location: party.location, alive: true };
  const antagonist = antagonists.find((a) => a.name === name);
  if (antagonist && antagonist.alive)
    return { location: antagonist.territory, alive: antagonist.alive };
  return null;
}
function resolvePartyConfrontation(party, state, target, world, rng, worldTime, antagonists, storyThreads) {
  const logs = [];
  if (!state.vendetta)
    return logs;
  const partyStrength = (party.fame ?? 0) + (state.morale ?? 0) + rng.int(5);
  const targetAntagonist = antagonists.find((a) => a.name === state.vendetta);
  const targetNpc = world.npcs.find((n) => n.name === state.vendetta);
  const targetParty = world.parties.find((p) => p.name === state.vendetta);
  let targetStrength = 5;
  if (targetAntagonist)
    targetStrength = targetAntagonist.threat + rng.int(3);
  if (targetParty)
    targetStrength = (targetParty.fame ?? 0) + rng.int(5);
  const partyWins = partyStrength > targetStrength;
  const battleEvent = {
    id: `battle-${Date.now()}`,
    type: "battle",
    timestamp: worldTime,
    location: party.location,
    actors: [party.name, state.vendetta],
    magnitude: 6,
    witnessed: true,
    data: {
      victor: partyWins ? party.name : state.vendetta,
      loser: partyWins ? state.vendetta : party.name,
      significance: 4
    }
  };
  logs.push(...processWorldEvent(battleEvent, world, rng, antagonists, storyThreads));
  if (partyWins) {
    if (targetAntagonist) {
      targetAntagonist.alive = false;
      const deathEvent = {
        id: `death-${Date.now()}`,
        type: "death",
        timestamp: worldTime,
        location: party.location,
        actors: [party.name],
        victims: [targetAntagonist.name],
        perpetrators: [party.name],
        magnitude: 8,
        witnessed: true,
        data: { cause: "vendetta", killedBy: party.name }
      };
      logs.push(...processWorldEvent(deathEvent, world, rng, antagonists, storyThreads));
    }
    if (targetNpc) {
      targetNpc.alive = false;
    }
    state.killList = [...state.killList ?? [], state.vendetta];
    state.vendetta = undefined;
    party.fame = (party.fame ?? 0) + 5;
    state.morale = Math.min(10, (state.morale ?? 0) + 3);
    logs.push({
      category: "road",
      summary: `${party.name} triumphs over ${battleEvent.data.loser}!`,
      details: `A great victory. Their enemy lies defeated. Songs will be sung of this day.`,
      location: party.location,
      actors: [party.name],
      worldTime,
      realTime: new Date,
      seed: world.seed
    });
  } else {
    party.wounded = true;
    party.restHoursRemaining = 24 + rng.int(24);
    state.morale = Math.max(-10, (state.morale ?? 0) - 4);
    party.fame = Math.max(0, (party.fame ?? 0) - 2);
    if (rng.chance(0.3) && party.members.length > 1) {
      const fallen = party.members.pop();
      logs.push({
        category: "road",
        summary: `${fallen} falls in battle against ${state.vendetta}`,
        details: `A bitter loss. ${party.name} retreats, diminished.`,
        location: party.location,
        actors: [party.name, fallen],
        worldTime,
        realTime: new Date,
        seed: world.seed
      });
    } else {
      logs.push({
        category: "road",
        summary: `${party.name} is defeated by ${state.vendetta}`,
        details: `They flee, wounded but alive. The vendetta continues.`,
        location: party.location,
        actors: [party.name],
        worldTime,
        realTime: new Date,
        seed: world.seed
      });
    }
  }
  return logs;
}
function tickFactionOperations(world, rng, worldTime, antagonists, storyThreads) {
  const logs = [];
  for (const faction of world.factions) {
    const state = getFactionState(world, faction.id);
    for (const op of state.activeOperations) {
      if (new Date(op.completesAt) <= worldTime) {
        logs.push(...resolveOperation(op, faction, state, world, rng, worldTime, antagonists, storyThreads));
      }
    }
    state.activeOperations = state.activeOperations.filter((op) => new Date(op.completesAt) > worldTime);
    if (state.enemies.length > 0 && state.activeOperations.length < 2) {
      if (rng.chance(0.05)) {
        const enemyId = rng.pick(state.enemies);
        const enemy = world.factions.find((f) => f.id === enemyId);
        const enemyState = getFactionState(world, enemyId);
        if (enemy && enemyState.territory.length > 0) {
          const targetSettlement = rng.pick(enemyState.territory);
          const hasCB = state.casusBelli[enemyId];
          const opType = hasCB ? "conquest" : "raid";
          const op = {
            id: `op-${Date.now()}`,
            type: opType,
            target: targetSettlement,
            startedAt: worldTime,
            completesAt: new Date(worldTime.getTime() + (12 + rng.int(24)) * 60 * 60 * 1000),
            participants: [],
            successChance: 0.4 + state.power / 200,
            resources: faction.wealth * 0.2,
            secret: false,
            reason: hasCB ? hasCB.reason : `War against ${enemy.name}`
          };
          state.activeOperations.push(op);
          logs.push({
            category: "faction",
            summary: `${faction.name} marshals forces against ${enemy.name}`,
            details: hasCB ? `Driven by ${hasCB.reason}, they seek to conquer ${targetSettlement}.` : `War continues. ${targetSettlement} is in their sights.`,
            location: targetSettlement,
            actors: [faction.name, enemy.name],
            worldTime,
            realTime: new Date,
            seed: world.seed
          });
          if (!world.armies.some((a) => a.ownerId === faction.id && a.location === targetSettlement)) {
            const homeBase = state.territory[0] || faction.name;
            const army = {
              id: `army-op-${Date.now()}`,
              ownerId: faction.id,
              location: homeBase,
              strength: 40 + rng.int(60),
              quality: 2,
              morale: 8,
              status: "marching",
              target: targetSettlement,
              supplies: 100,
              supplyLineFrom: homeBase,
              lastSupplied: worldTime
            };
            world.armies.push(army);
          }
        }
      }
    }
    if (state.resourceNeeds.length > 0 && state.activeOperations.length < 2 && rng.chance(0.1)) {
      const need = rng.pick(state.resourceNeeds);
      const targetSettlement = world.settlements.find((s) => s.supply[need] > 2);
      if (targetSettlement) {
        const sState = getSettlementState(world, targetSettlement.name);
        const currentOwnerId = sState.controlledBy;
        if (currentOwnerId !== faction.id) {
          const op = {
            id: `op-res-${Date.now()}`,
            type: "resource-grab",
            target: targetSettlement.name,
            startedAt: worldTime,
            completesAt: new Date(worldTime.getTime() + (24 + rng.int(48)) * 60 * 60 * 1000),
            participants: [],
            successChance: 0.3 + state.power / 200,
            resources: faction.wealth * 0.15,
            secret: false,
            reason: `Secure ${need} supplies from ${targetSettlement.name}`
          };
          state.activeOperations.push(op);
          logs.push({
            category: "faction",
            summary: `${faction.name} eyes ${targetSettlement.name} for its ${need}`,
            details: `Desperate for ${need}, the faction has decided to take the settlement by force.`,
            location: targetSettlement.name,
            actors: [faction.name],
            worldTime,
            realTime: new Date,
            seed: world.seed
          });
        }
      }
    }
    if (state.recentWins >= 3 && rng.chance(0.1)) {
      const uncontrolled = world.settlements.filter((s) => {
        const sState = getSettlementState(world, s.name);
        return !sState.controlledBy && !sState.contested;
      });
      if (uncontrolled.length > 0) {
        const target = rng.pick(uncontrolled);
        const targetState = getSettlementState(world, target.name);
        targetState.contested = true;
        logs.push({
          category: "faction",
          summary: `${faction.name} moves on ${target.name}`,
          details: `Emboldened by success, they seek to expand their influence.`,
          location: target.name,
          actors: [faction.name],
          worldTime,
          realTime: new Date,
          seed: world.seed
        });
        queueConsequence({
          type: "spawn-event",
          triggerEvent: `${faction.name} expansion`,
          turnsUntilResolution: 24 + rng.int(48),
          data: {
            category: "faction",
            summary: `${faction.name} takes control of ${target.name}`,
            details: `Through diplomacy and shows of force, the settlement falls under their sway.`,
            location: target.name,
            actors: [faction.name]
          },
          priority: 4
        });
        setTimeout(() => {
          if (!targetState.controlledBy) {
            targetState.controlledBy = faction.id;
            targetState.contested = false;
            state.territory.push(target.name);
          }
        }, 0);
        state.recentWins = 0;
      }
    }
    if (faction.focus === "trade" && state.enemies.length > 0 && rng.chance(0.03)) {
      const enemyId = rng.pick(state.enemies);
      const enemy = world.factions.find((f) => f.id === enemyId);
      const enemyState = getFactionState(world, enemyId);
      if (enemy && enemyState.territory.length > 0 && !state.activeOperations.some((op) => op.type === "trade-embargo")) {
        const target = rng.pick(enemyState.territory);
        const op = {
          id: `op-embargo-${Date.now()}`,
          type: "trade-embargo",
          target,
          startedAt: worldTime,
          completesAt: new Date(worldTime.getTime() + 7 * 24 * 60 * 60 * 1000),
          participants: [],
          successChance: 0.7,
          resources: faction.wealth * 0.1,
          secret: false,
          reason: `Economic warfare against ${enemy.name}`
        };
        state.activeOperations.push(op);
        logs.push({
          category: "faction",
          summary: `${faction.name} declares embargo on ${target}`,
          details: `Trade caravans are turned away. Merchants grumble. The economic stranglehold begins.`,
          location: target,
          actors: [faction.name, enemy.name],
          worldTime,
          realTime: new Date,
          seed: world.seed
        });
      }
    }
    if (faction.focus === "pious" && state.power >= 60 && rng.chance(0.02)) {
      const heretical = world.settlements.find((s) => {
        const sState = getSettlementState(world, s.name);
        return sState.controlledBy && state.enemies.includes(sState.controlledBy);
      });
      if (heretical && !state.activeOperations.some((op) => op.type === "crusade")) {
        const op = {
          id: `op-crusade-${Date.now()}`,
          type: "crusade",
          target: heretical.name,
          startedAt: worldTime,
          completesAt: new Date(worldTime.getTime() + 14 * 24 * 60 * 60 * 1000),
          participants: [],
          successChance: 0.5,
          resources: faction.wealth * 0.3,
          secret: false,
          reason: `Holy war to reclaim ${heretical.name} for the faithful`
        };
        state.activeOperations.push(op);
        logs.push({
          category: "faction",
          summary: `${faction.name} declares a crusade against ${heretical.name}`,
          details: `The faithful take up arms. Temple bells ring. A holy war begins.`,
          location: heretical.name,
          actors: [faction.name],
          worldTime,
          realTime: new Date,
          seed: world.seed
        });
      }
    }
    if (state.morale < -3 && rng.chance(0.05)) {
      const homeTerritory = state.territory[0] ?? world.settlements[0]?.name;
      if (homeTerritory && !state.activeOperations.some((op) => op.type === "propaganda")) {
        const op = {
          id: `op-prop-${Date.now()}`,
          type: "propaganda",
          target: homeTerritory,
          startedAt: worldTime,
          completesAt: new Date(worldTime.getTime() + 3 * 24 * 60 * 60 * 1000),
          participants: [],
          successChance: 0.8,
          resources: 50,
          secret: false,
          reason: "Restoring morale through public messaging"
        };
        state.activeOperations.push(op);
        logs.push({
          category: "faction",
          summary: `${faction.name} launches propaganda campaign`,
          details: `Heralds spread word of past glories. Bards sing of heroic deeds. The people must believe.`,
          location: homeTerritory,
          actors: [faction.name],
          worldTime,
          realTime: new Date,
          seed: world.seed
        });
      }
    }
    if (state.enemies.length > 0 && faction.focus === "martial" && rng.chance(0.01)) {
      const enemyId = rng.pick(state.enemies);
      const enemy = world.factions.find((f) => f.id === enemyId);
      const enemyLeaders = world.npcs.filter((n) => n.alive !== false && n.loyalty === enemyId && (n.level ?? 1) >= 5);
      if (enemy && enemyLeaders.length > 0 && !state.activeOperations.some((op) => op.type === "assassination")) {
        const target = rng.pick(enemyLeaders);
        const op = {
          id: `op-assassin-${Date.now()}`,
          type: "assassination",
          target: target.name,
          secondaryTarget: enemy.name,
          startedAt: worldTime,
          completesAt: new Date(worldTime.getTime() + 5 * 24 * 60 * 60 * 1000),
          participants: [],
          successChance: 0.3,
          resources: 200,
          secret: true,
          reason: `Eliminate ${target.name}, a key figure in ${enemy.name}`
        };
        state.activeOperations.push(op);
      }
    }
    if (state.allies.length === 0 && world.factions.length > 2 && rng.chance(0.02)) {
      const potential = world.factions.find((f) => f.id !== faction.id && !state.enemies.includes(f.id) && !state.allies.includes(f.id));
      if (potential && !state.activeOperations.some((op) => op.type === "marriage-alliance")) {
        const op = {
          id: `op-marriage-${Date.now()}`,
          type: "marriage-alliance",
          target: potential.name,
          startedAt: worldTime,
          completesAt: new Date(worldTime.getTime() + 30 * 24 * 60 * 60 * 1000),
          participants: [],
          successChance: 0.5,
          resources: 500,
          secret: false,
          reason: `Forge alliance with ${potential.name} through marriage`
        };
        state.activeOperations.push(op);
        logs.push({
          category: "faction",
          summary: `${faction.name} proposes marriage alliance with ${potential.name}`,
          details: `Envoys are sent. Dowries discussed. A political wedding could reshape alliances.`,
          actors: [faction.name, potential.name],
          worldTime,
          realTime: new Date,
          seed: world.seed
        });
      }
    }
    if (faction.focus === "pious" && rng.chance(0.01)) {
      const territory = state.territory[0];
      if (territory && !state.activeOperations.some((op) => op.type === "inquisition")) {
        const op = {
          id: `op-inq-${Date.now()}`,
          type: "inquisition",
          target: territory,
          startedAt: worldTime,
          completesAt: new Date(worldTime.getTime() + 14 * 24 * 60 * 60 * 1000),
          participants: [],
          successChance: 0.7,
          resources: 100,
          secret: false,
          reason: "Root out heresy and corruption"
        };
        state.activeOperations.push(op);
        logs.push({
          category: "faction",
          summary: `${faction.name} launches inquisition in ${territory}`,
          details: `Investigators arrive. Questions are asked. The faithful have nothing to fear—or so they say.`,
          location: territory,
          actors: [faction.name],
          worldTime,
          realTime: new Date,
          seed: world.seed
        });
      }
    }
    if (faction.focus === "martial" && state.enemies.length > 0 && rng.chance(0.02)) {
      const enemyId = rng.pick(state.enemies);
      const enemyState = getFactionState(world, enemyId);
      if (enemyState.territory.length > 0 && !state.activeOperations.some((op) => op.type === "blockade")) {
        const target = rng.pick(enemyState.territory);
        const op = {
          id: `op-block-${Date.now()}`,
          type: "blockade",
          target,
          startedAt: worldTime,
          completesAt: new Date(worldTime.getTime() + 10 * 24 * 60 * 60 * 1000),
          participants: [],
          successChance: 0.6,
          resources: faction.wealth * 0.15,
          secret: false,
          reason: `Starve out ${target}`
        };
        state.activeOperations.push(op);
        logs.push({
          category: "faction",
          summary: `${faction.name} blockades ${target}`,
          details: `Roads are cut. Caravans turned back. Nothing enters or leaves.`,
          location: target,
          actors: [faction.name],
          worldTime,
          realTime: new Date,
          seed: world.seed
        });
      }
    }
    const crisisSettlement = world.settlements.find((s) => {
      const sState = getSettlementState(world, s.name);
      return sState.disease || sState.prosperity < -5;
    });
    if (crisisSettlement && (faction.focus === "pious" || faction.focus === "trade") && rng.chance(0.03)) {
      if (!state.activeOperations.some((op) => op.type === "relief")) {
        const op = {
          id: `op-relief-${Date.now()}`,
          type: "relief",
          target: crisisSettlement.name,
          startedAt: worldTime,
          completesAt: new Date(worldTime.getTime() + 7 * 24 * 60 * 60 * 1000),
          participants: [],
          successChance: 0.9,
          resources: 300,
          secret: false,
          reason: `Aid the suffering of ${crisisSettlement.name}`
        };
        state.activeOperations.push(op);
        logs.push({
          category: "faction",
          summary: `${faction.name} sends relief to ${crisisSettlement.name}`,
          details: `Wagons of grain and medicine roll toward the suffering. Compassion—or calculated politics?`,
          location: crisisSettlement.name,
          actors: [faction.name],
          worldTime,
          realTime: new Date,
          seed: world.seed
        });
      }
    }
  }
  return logs;
}
function tickSpellcasting(world, rng, worldTime) {
  const logs = [];
  const casters = world.npcs.filter((n) => n.alive !== false && n.level && n.level >= 5 && (n.class === "Magic-User" || n.class === "Cleric" || n.class === "Elf"));
  for (const caster of casters) {
    if (!rng.chance(0.02))
      continue;
    const spells = caster.class === "Magic-User" || caster.class === "Elf" ? ["Control Weather", "Cloudkill", "Wall of Iron"] : ["Bless", "Cure Disease", "Raise Dead", "Insect Plague"];
    const spell = rng.pick(spells);
    switch (spell) {
      case "Control Weather": {
        const newWeather = rng.pick(["clear", "cloudy", "rain", "storm", "snow", "fog"]);
        if (world.calendar)
          world.calendar.weather = newWeather;
        logs.push({
          category: "weather",
          summary: `${caster.name} alters the weather`,
          details: `Through ancient incantations, the ${caster.class} calls forth ${newWeather} over the region.`,
          location: caster.location,
          actors: [caster.name],
          worldTime,
          realTime: new Date,
          seed: world.seed
        });
        break;
      }
      case "Cloudkill": {
        const settlement = world.settlements.find((s) => s.name === caster.location);
        if (settlement) {
          const state = getSettlementState(world, settlement.name);
          state.prosperity = Math.max(-10, state.prosperity - 3);
          state.populationDelta -= 50;
          logs.push({
            category: "town",
            summary: `Magical mist chokes ${settlement.name}`,
            details: `A toxic green cloud, conjured by ${caster.name}, rolls through the streets. Panic ensues.`,
            location: settlement.name,
            actors: [caster.name],
            worldTime,
            realTime: new Date,
            seed: world.seed
          });
        }
        break;
      }
      case "Bless": {
        const settlement = world.settlements.find((s) => s.name === caster.location);
        if (settlement) {
          const state = getSettlementState(world, settlement.name);
          state.safety = Math.min(10, state.safety + 2);
          settlement.mood = Math.min(5, settlement.mood + 1);
          logs.push({
            category: "town",
            summary: `Divine blessing upon ${settlement.name}`,
            details: `${caster.name} performs a grand ritual of sanctification. A sense of peace fills the air.`,
            location: settlement.name,
            actors: [caster.name],
            worldTime,
            realTime: new Date,
            seed: world.seed
          });
        }
        break;
      }
      case "Raise Dead": {
        const deadNpcs = world.npcs.filter((n) => n.alive === false && n.location === caster.location);
        if (deadNpcs.length > 0) {
          const target = rng.pick(deadNpcs);
          target.alive = true;
          target.wounded = true;
          logs.push({
            category: "town",
            summary: `${caster.name} returns ${target.name} from the grave!`,
            details: `A miracle! The gates of death are pulled back. ${target.name} breathes once more, though they are weak.`,
            location: caster.location,
            actors: [caster.name, target.name],
            worldTime,
            realTime: new Date,
            seed: world.seed
          });
        }
        break;
      }
    }
  }
  return logs;
}
function resolveOperation(op, faction, factionState, world, rng, worldTime, antagonists, storyThreads) {
  const logs = [];
  const success = rng.chance(op.successChance);
  switch (op.type) {
    case "raid": {
      const settlement = world.settlements.find((s) => s.name === op.target);
      if (!settlement)
        break;
      if (success) {
        const raidEvent = {
          id: `raid-${Date.now()}`,
          type: "raid",
          timestamp: worldTime,
          location: op.target,
          actors: [faction.name],
          perpetrators: [faction.name],
          magnitude: 5,
          witnessed: true,
          data: {
            damage: 2 + rng.int(3),
            loot: ["gold", "supplies"],
            casualties: rng.int(2)
          }
        };
        logs.push(...processWorldEvent(raidEvent, world, rng, antagonists, storyThreads));
        factionState.resources += 20;
        factionState.recentWins += 1;
        logs.push({
          category: "faction",
          summary: `${faction.name} raids ${op.target}`,
          details: `Swift and brutal, they strike and withdraw with plunder.`,
          location: op.target,
          actors: [faction.name],
          worldTime,
          realTime: new Date,
          seed: world.seed
        });
      } else {
        factionState.recentLosses += 1;
        factionState.power = Math.max(0, factionState.power - 5);
        logs.push({
          category: "faction",
          summary: `${faction.name}'s raid on ${op.target} fails`,
          details: `The defenders held strong. They retreat in disarray.`,
          location: op.target,
          actors: [faction.name],
          worldTime,
          realTime: new Date,
          seed: world.seed
        });
      }
      break;
    }
  }
  return logs;
}

// src/domain.ts
function tickDomains(world, rng, worldTime) {
  const logs = [];
  const dayOfMonth = worldTime.getUTCDate();
  if (dayOfMonth !== 1)
    return logs;
  for (const stronghold of world.strongholds) {
    if (!stronghold.constructionFinished)
      continue;
    const taxIncome = Math.floor(stronghold.population * (stronghold.taxRate / 10));
    stronghold.treasury += taxIncome;
    const upkeep = stronghold.staff * 2 + Math.floor(stronghold.population / 10);
    stronghold.treasury = Math.max(0, stronghold.treasury - upkeep);
    if (stronghold.taxRate > 15)
      stronghold.unrest += 1;
    if (stronghold.treasury === 0)
      stronghold.unrest += 2;
    if (stronghold.unrest > 0 && rng.chance(0.2))
      stronghold.unrest -= 1;
    if (stronghold.unrest < 3 && stronghold.treasury > upkeep * 2) {
      const growth = 1 + rng.int(Math.floor(stronghold.population * 0.05) + 1);
      stronghold.population += growth;
      logs.push({
        category: "town",
        summary: `Settlers arrive at ${stronghold.name}`,
        details: `Drawn by the promise of safety and fair rule, ${growth} new families have taken up residence in the domain.`,
        location: `hex:${stronghold.location.q},${stronghold.location.r}`,
        worldTime,
        realTime: new Date,
        seed: world.seed
      });
    }
    logs.push({
      category: "faction",
      summary: `Monthly report for ${stronghold.name}`,
      details: `Tax collection: ${taxIncome}gp. Upkeep: ${upkeep}gp. Current Treasury: ${stronghold.treasury}gp. Population: ${stronghold.population} families.`,
      location: `hex:${stronghold.location.q},${stronghold.location.r}`,
      worldTime,
      realTime: new Date,
      seed: world.seed
    });
    if (stronghold.unrest >= 8) {
      logs.push({
        category: "faction",
        summary: `Uprising in ${stronghold.name}!`,
        details: `The peasantry has reached a breaking point. Angry mobs gather at the gates of the ${stronghold.type}.`,
        location: `hex:${stronghold.location.q},${stronghold.location.r}`,
        worldTime,
        realTime: new Date,
        seed: world.seed
      });
    }
  }
  return logs;
}

// src/war-machine.ts
function calculateBattleRating(army, world) {
  let br = 0;
  br += Math.floor(army.strength / 10);
  br += army.quality * 10;
  br += (army.morale - 7) * 5;
  const ownerNpc = world.npcs.find((n) => n.id === army.ownerId);
  if (ownerNpc && ownerNpc.level) {
    br += ownerNpc.level * 2;
  }
  return br;
}
function resolveBattle(attacker, defender, world, rng, worldTime) {
  const logs = [];
  const attackerBR = calculateBattleRating(attacker, world) + rng.int(20);
  const defenderBR = calculateBattleRating(defender, world) + rng.int(20);
  const diff = attackerBR - defenderBR;
  const attackerWins = diff > 0;
  const winner = attackerWins ? attacker : defender;
  const loser = attackerWins ? defender : attacker;
  const loserLossesPct = 10 + rng.int(Math.abs(diff) / 2 + 10);
  const winnerLossesPct = rng.int(loserLossesPct / 2);
  const loserLossesCount = Math.floor(loser.strength * (loserLossesPct / 100));
  const winnerLossesCount = Math.floor(winner.strength * (winnerLossesPct / 100));
  loser.strength -= loserLossesCount;
  winner.strength -= winnerLossesCount;
  loser.morale = Math.max(2, loser.morale - 2);
  winner.morale = Math.min(12, winner.morale + 1);
  if (loser.morale <= 3 && rng.chance(0.5)) {
    loser.status = "surrendered";
    logs.push({
      category: "faction",
      summary: `${loser.ownerId}'s forces surrender!`,
      details: `Facing total annihilation, the remaining troops throw down their arms.`,
      location: attacker.location,
      worldTime,
      realTime: new Date,
      seed: world.seed
    });
    const ownerNpc = world.npcs.find((n) => n.id === loser.ownerId);
    if (ownerNpc && rng.chance(0.8)) {
      if (!winner.capturedLeaders)
        winner.capturedLeaders = [];
      winner.capturedLeaders.push(ownerNpc.id);
      logs.push({
        category: "faction",
        summary: `${ownerNpc.name} taken prisoner`,
        details: `The commander of the defeated forces is led away in chains.`,
        location: attacker.location,
        actors: [ownerNpc.name],
        worldTime,
        realTime: new Date,
        seed: world.seed
      });
    }
  }
  const result = {
    winner,
    loser,
    winnerLosses: winnerLossesCount,
    loserLosses: loserLossesCount,
    fatality: rng.chance(0.05)
  };
  logs.push({
    category: "faction",
    summary: `Battle at ${attacker.location}`,
    details: `${winner.ownerId}'s forces triumph over ${loser.ownerId}! ${loser.ownerId} lost ${loserLossesCount} troops, while ${winner.ownerId} lost ${winnerLossesCount}.`,
    location: attacker.location,
    worldTime,
    realTime: new Date,
    seed: world.seed
  });
  return { logs, result };
}
function tickSupplies(world, rng, worldTime) {
  const logs = [];
  for (const army of world.armies) {
    const consumption = 0.5 + army.strength / 200;
    army.supplies = Math.max(0, army.supplies - consumption);
    if (army.supplies < 80 && army.supplyLineFrom) {
      const isPathSafe = checkSupplyLineSafety(army, world, rng);
      if (isPathSafe) {
        const dist = 1;
        const resupplyAmount = Math.max(2, 10 - dist);
        army.supplies = Math.min(100, army.supplies + resupplyAmount);
        army.lastSupplied = worldTime;
        if (army.status === "starving")
          army.status = "idle";
      } else {
        if (rng.chance(0.1)) {
          logs.push({
            category: "faction",
            summary: `Supply lines disrupted for ${army.ownerId}'s forces`,
            details: `The path to ${army.supplyLineFrom} is blocked or too dangerous. The troops are beginning to worry.`,
            location: army.location,
            worldTime,
            realTime: new Date,
            seed: world.seed
          });
        }
      }
    }
    if (army.supplies <= 0) {
      army.status = "starving";
      army.morale = Math.max(2, army.morale - 0.5);
      const deaths = Math.floor(army.strength * 0.02);
      army.strength -= deaths;
      if (rng.chance(0.05)) {
        logs.push({
          category: "faction",
          summary: `${army.ownerId}'s army is starving at ${army.location}`,
          details: `With no supplies reaching the camp, ${deaths} troops have perished or deserted. Morale is at a breaking point.`,
          location: army.location,
          worldTime,
          realTime: new Date,
          seed: world.seed
        });
      }
    }
  }
  return logs;
}
function checkSupplyLineSafety(army, world, rng) {
  if (!army.supplyLineFrom)
    return false;
  if (army.location === army.supplyLineFrom)
    return true;
  const enemyArmiesAtSource = world.armies.filter((a) => a.location === army.supplyLineFrom && areEnemies(a.ownerId, army.ownerId, world));
  if (enemyArmiesAtSource.length > 0)
    return false;
  const sState = getSettlementState(world, army.supplyLineFrom);
  if (sState && sState.unrest > 7)
    return false;
  return true;
}
function tickArmies(world, rng, worldTime) {
  const logs = [];
  logs.push(...tickSupplies(world, rng, worldTime));
  for (const army of world.armies) {
    if (army.status === "marching" && army.target) {
      const currentLoc = world.settlements.find((s) => s.name === army.location);
      const targetLoc = world.settlements.find((s) => s.name === army.target);
      if (!currentLoc || !targetLoc) {
        if (rng.chance(0.1)) {
          army.location = army.target;
          army.status = "idle";
          army.target = undefined;
        }
      } else {
        if (rng.chance(0.015)) {
          army.location = army.target;
          army.status = "idle";
          army.target = undefined;
          logs.push({
            category: "faction",
            summary: `Army arrives at ${army.location}`,
            details: `The forces of ${army.ownerId} have completed their march.`,
            location: army.location,
            worldTime,
            realTime: new Date,
            seed: world.seed
          });
        }
      }
    }
  }
  const locations = new Set(world.armies.map((a) => a.location));
  for (const loc of locations) {
    const armiesHere = world.armies.filter((a) => a.location === loc && a.strength > 0);
    if (armiesHere.length >= 2) {
      for (let i = 0;i < armiesHere.length; i++) {
        for (let j = i + 1;j < armiesHere.length; j++) {
          const a1 = armiesHere[i];
          const a2 = armiesHere[j];
          if (areEnemies(a1.ownerId, a2.ownerId, world)) {
            const { logs: battleLogs } = resolveBattle(a1, a2, world, rng, worldTime);
            logs.push(...battleLogs);
          }
        }
      }
    }
  }
  world.armies = world.armies.filter((a) => a.strength > 0);
  return logs;
}
function areEnemies(id1, id2, world) {
  if (id1 === id2)
    return false;
  const f1 = world.factions.find((f) => f.id === id1 || f.name === id1);
  const f2 = world.factions.find((f) => f.id === id2 || f.name === id2);
  if (f1 && f2) {
    if (world.factionStates?.[f1.id]?.enemies.includes(f2.id))
      return true;
    if (world.factionStates?.[f2.id]?.enemies.includes(f1.id))
      return true;
  }
  const p1 = world.parties.find((p) => p.id === id1 || p.name === id1);
  const p2 = world.parties.find((p) => p.id === id2 || p.name === id2);
  if (p1 && f2) {
    if (world.partyStates?.[p1.id]?.enemies.includes(f2.id))
      return true;
  }
  if (p2 && f1) {
    if (world.partyStates?.[p2.id]?.enemies.includes(f1.id))
      return true;
  }
  const n1 = world.npcs.find((n) => n.id === id1 || n.name === id1);
  const n2 = world.npcs.find((n) => n.id === id2 || n.name === id2);
  if (n1 && n2) {
    const n1Agendas = n1.agendas || [];
    if (n1Agendas.some((a) => a.type === "revenge" && a.target === n2.name))
      return true;
  }
  return false;
}

// src/logistics.ts
function tickDisease(world, rng, worldTime) {
  const logs = [];
  for (const settlement of world.settlements) {
    const sState = getSettlementState(world, settlement.name);
    if (!sState.disease && rng.chance(0.001 - sState.prosperity / 1e4)) {
      sState.disease = {
        type: rng.pick(["Camp Fever", "The Red Ache", "Gripsha", "Yellow Plague"]),
        intensity: 2 + rng.int(3),
        spreadRate: 0.1 + rng.next() * 0.2,
        discovered: false
      };
    }
    if (sState.disease) {
      const d = sState.disease;
      if (!d.discovered && rng.chance(0.1)) {
        d.discovered = true;
        logs.push({
          category: "town",
          summary: `Disease outbreak in ${settlement.name}!`,
          details: `Local healers have identified ${d.type} among the populace. Fear spreads as quickly as the sickness.`,
          location: settlement.name,
          worldTime,
          realTime: new Date,
          seed: world.seed
        });
        sState.safety -= 2;
        sState.unrest += 1;
      }
      if (rng.chance(0.1)) {
        d.intensity += rng.next() > 0.6 ? 1 : -1;
        if (d.intensity <= 0) {
          logs.push({
            category: "town",
            summary: `${d.type} fades in ${settlement.name}`,
            details: `The worst of the sickness has passed. The bells ring in celebration.`,
            location: settlement.name,
            worldTime,
            realTime: new Date,
            seed: world.seed
          });
          sState.disease = undefined;
          continue;
        }
      }
      const armiesHere = world.armies.filter((a) => a.location === settlement.name);
      for (const army of armiesHere) {
        if (army.status !== "diseased" && rng.chance(d.spreadRate)) {
          army.status = "diseased";
          if (d.discovered) {
            logs.push({
              category: "faction",
              summary: `${army.ownerId}'s forces infected with ${d.type}`,
              details: `While stationed at ${settlement.name}, the troops have fallen ill.`,
              location: settlement.name,
              worldTime,
              realTime: new Date,
              seed: world.seed
            });
          }
        }
      }
      const partiesHere = world.parties.filter((p) => p.location === settlement.name);
      for (const party of partiesHere) {
        if (!party.wounded && rng.chance(d.spreadRate / 2)) {
          party.wounded = true;
          party.restHoursRemaining = 48;
          if (d.discovered) {
            logs.push({
              category: "road",
              summary: `${party.name} falls ill in ${settlement.name}`,
              details: `The ${d.type} has claimed members of the company. They must rest to recover.`,
              location: settlement.name,
              worldTime,
              realTime: new Date,
              seed: world.seed
            });
          }
        }
      }
    }
  }
  for (const army of world.armies) {
    if (army.status === "diseased") {
      const sState = getSettlementState(world, army.location);
      if (sState && !sState.disease && rng.chance(0.1)) {
        sState.disease = {
          type: "Camp Fever",
          intensity: 3,
          spreadRate: 0.15,
          discovered: false
        };
      }
    }
  }
  for (const caravan of world.caravans) {
    const fromState = getSettlementState(world, caravan.location);
    if (fromState.disease && rng.chance(fromState.disease.spreadRate)) {
      const toSettlement = world.settlements.find((s) => (caravan.route[0] === caravan.location ? caravan.route[1] : caravan.route[0]) === s.id);
      if (toSettlement) {
        const toState = getSettlementState(world, toSettlement.name);
        if (!toState.disease && rng.chance(0.3)) {
          toState.disease = { ...fromState.disease, discovered: false, intensity: 1 };
        }
      }
    }
  }
  for (const army of world.armies) {
    if (army.status === "diseased") {
      const deaths = Math.floor(army.strength * 0.01);
      army.strength -= deaths;
      army.morale = Math.max(2, army.morale - 0.1);
      if (rng.chance(0.05)) {
        logs.push({
          category: "faction",
          summary: `Sickness ravages ${army.ownerId}'s army`,
          details: `Fever spreads through the camp. ${deaths} soldiers are unfit for duty or dead.`,
          location: army.location,
          worldTime,
          realTime: new Date,
          seed: world.seed
        });
      }
      if (rng.chance(0.05)) {
        army.status = "idle";
      }
    }
  }
  return logs;
}
function tickMercenaries(world, rng, worldTime) {
  const logs = [];
  for (const merc of world.mercenaries) {
    if (!merc.hiredById && rng.chance(0.02)) {
      const nextSettlement = rng.pick(world.settlements);
      merc.location = nextSettlement.name;
    }
    if (!merc.hiredById) {
      for (const faction of world.factions) {
        const fState = getFactionState(world, faction.id);
        if (faction.wealth > merc.monthlyRate * 3 && fState.power < 40 && rng.chance(0.05)) {
          merc.hiredById = faction.id;
          faction.wealth -= merc.monthlyRate;
          const army = {
            id: `army-merc-${merc.id}`,
            ownerId: faction.id,
            location: merc.location,
            strength: merc.size,
            quality: merc.quality,
            morale: merc.loyalty,
            status: "idle",
            supplies: 100,
            supplyLineFrom: merc.location,
            lastSupplied: worldTime,
            isMercenary: true,
            costPerMonth: merc.monthlyRate
          };
          world.armies.push(army);
          logs.push({
            category: "faction",
            summary: `${faction.name} hires ${merc.name}`,
            details: `The mercenary company has signed a contract for ${merc.monthlyRate}gp per month. Their spears are now at the faction's disposal.`,
            location: merc.location,
            actors: [faction.name, merc.name],
            worldTime,
            realTime: new Date,
            seed: world.seed
          });
          break;
        }
      }
    }
  }
  return logs;
}

// src/diplomacy.ts
function tickDiplomacy(world, rng, worldTime) {
  const logs = [];
  for (const army of world.armies) {
    if (army.capturedLeaders && army.capturedLeaders.length > 0) {
      for (const prisonerId of army.capturedLeaders) {
        if (rng.chance(0.05)) {
          const prisoner = world.npcs.find((n) => n.id === prisonerId);
          if (!prisoner)
            continue;
          const captorFaction = world.factions.find((f) => f.id === army.ownerId);
          const prisonerFaction = world.factions.find((f) => f.id === prisoner.loyalty);
          if (captorFaction && prisonerFaction) {
            const ransomAmount = (prisoner.level ?? 1) * 100;
            if (prisonerFaction.wealth >= ransomAmount) {
              prisonerFaction.wealth -= ransomAmount;
              captorFaction.wealth += ransomAmount;
              army.capturedLeaders = army.capturedLeaders.filter((id) => id !== prisonerId);
              logs.push({
                category: "faction",
                summary: `${prisoner.name} is ransomed`,
                details: `${prisonerFaction.name} has paid ${ransomAmount}gp to ${captorFaction.name} for the release of their leader.`,
                location: army.location,
                actors: [prisoner.name, captorFaction.name],
                worldTime,
                realTime: new Date,
                seed: world.seed
              });
              if (rng.chance(0.3)) {
                queueConsequence({
                  type: "spawn-event",
                  triggerEvent: `Ransom of ${prisoner.name}`,
                  turnsUntilResolution: 24 + rng.int(48),
                  data: {
                    category: "faction",
                    summary: `Peace talks begin between ${captorFaction.name} and ${prisonerFaction.name}`,
                    details: `The return of ${prisoner.name} has opened a window for diplomacy.`,
                    actors: [captorFaction.name, prisonerFaction.name]
                  },
                  priority: 5
                });
              }
            }
          }
        }
      }
    }
  }
  for (const faction of world.factions) {
    const fState = getFactionState(world, faction.id);
    for (const enemyId of fState.enemies) {
      const enemyState = getFactionState(world, enemyId);
      if (fState.recentLosses > 5 && enemyState.recentLosses > 5 || fState.power > 80 && enemyState.power < 20) {
        if (rng.chance(0.01)) {
          fState.enemies = fState.enemies.filter((id) => id !== enemyId);
          enemyState.enemies = enemyState.enemies.filter((id) => id !== faction.id);
          const enemy = world.factions.find((f) => f.id === enemyId);
          logs.push({
            category: "faction",
            summary: `Peace treaty signed: ${faction.name} and ${enemy?.name}`,
            details: `After long conflict, both sides have agreed to lay down their arms. The borders are recognized once more.`,
            worldTime,
            realTime: new Date,
            seed: world.seed
          });
        }
      }
    }
  }
  return logs;
}

// src/legendary.ts
var WEAPON_NAMES = {
  sword: ["Dawnbringer", "Nightfall", "Oathkeeper", "Widowmaker", "Soulreaver", "Frostbite", "Hellfire", "Starfall", "Griefbringer", "Peacemaker"],
  axe: ["Skullsplitter", "Worldbreaker", "Headswoman", "Thunderclap", "Blooddrinker", "Giantsbane", "Treefeller", "Bonecruncher"],
  spear: ["Godspear", "Serpent-Tongue", "Skypierce", "Heartseeker", "Stormcaller", "Orc-Prod", "Dragonlance", "Soulspear"],
  bow: ["Whisperwind", "Deadeye", "Starshot", "Nighthawk", "Doomstring", "Farseeker", "Moonbow", "Sunfire"],
  mace: ["Doomhammer", "Bonecrusher", "Judgement", "Penitence", "Stonebreaker", "Lawbringer", "Mercy", "Wrath"],
  dagger: ["Whisper", "Backstab", "Heartsting", "Shadowfang", "Venom", "Silencer", "Kingslayer", "Nightblade"],
  staff: ["Worldtree", "Stormcaller", "Lifegiver", "Deathshead", "Starfire", "Moonbeam", "Sunray", "Shadowstaff"],
  hammer: ["Earthshaker", "Thunderstrike", "Godsforge", "Titanhammer", "Giantmaker", "Worldforger", "Doomfall", "Mountainbreaker"]
};
var WEAPON_EPITHETS = [
  "the Orc-Cleaver",
  "Bane of Dragons",
  "the Kingmaker",
  "Doom of the Undead",
  "the Godslayer",
  "Hope of the Faithful",
  "Terror of the North",
  "the Liberator",
  "Scourge of Demons",
  "the Peacekeeper",
  "Destroyer of Armies",
  "the Last Word",
  "Friend of Heroes",
  "the Betrayer",
  "Light in Darkness",
  "the Final Mercy"
];
var WEAPON_MATERIALS = [
  "star-metal",
  "dragon-bone",
  "shadow-forged",
  "sky-iron",
  "mithril",
  "adamantine",
  "crystal",
  "obsidian",
  "blessed silver",
  "demon-steel",
  "phoenix-feather",
  "elf-wrought",
  "dwarf-forged",
  "giant-bone",
  "god-touched"
];
var WEAPON_HISTORIES = [
  "Forged in the First Age by the Smith-God himself.",
  "Carried by the Last King into the Battle of Broken Crowns.",
  "Pulled from the heart of a dying star by heroes of legend.",
  "Cursed by a dying witch-queen, blessed by a saint.",
  "Lost for a thousand years beneath the Sunken Temple.",
  "Won from a dragon's hoard by trickery and courage.",
  "The only weapon ever to wound the Immortal Tyrant.",
  "Passed down through twelve generations of heroes, each dying gloriously.",
  "Forged from the chains that bound an ancient god.",
  "Created to slay a specific demon; that demon still lives."
];
var WEAPON_CURSES = [
  "Cannot be sheathed once drawn until it tastes blood.",
  "Whispers the names of all it has slain.",
  "Burns the unworthy who dare wield it.",
  "Brings doom to all who love its bearer.",
  "Thirsts for the blood of innocents.",
  "Will one day betray its wielder at the worst moment.",
  "Slowly corrupts the soul of its bearer.",
  "Attracts the attention of dark powers."
];
var UNIQUE_MONSTER_TEMPLATES = [
  {
    species: "dragon",
    names: ["Vermithrax", "Smaug-spawn", "Ancalagon the Lesser", "Glaurung-kin", "Fafnir-blood"],
    epithets: ["the Desolator", "Bane of Kingdoms", "the Eternal", "Father of Ash", "the Unconquered"],
    descriptions: [
      "Scales like black iron, eyes like dying suns.",
      "So ancient even other dragons fear to speak its name.",
      "Three heads, each with its own cruel cunning.",
      "Wingspan blots out the sun for a mile."
    ]
  },
  {
    species: "giant",
    names: ["Ymir-spawn", "Gogmagog", "Typhon", "Atlas-kin", "Kronos-blood"],
    epithets: ["the Mountain-Walker", "World-Shaker", "the Undying", "Breaker of Cities"],
    descriptions: [
      "Taller than castle walls, older than kingdoms.",
      "Stone for flesh, magma for blood.",
      "Last of a race of world-builders.",
      "Carries a club that was once a great oak."
    ]
  },
  {
    species: "demon",
    names: ["Azmodeth", "Bael-spawn", "Mephistar", "Abraxon", "Demonlord"],
    epithets: ["the Corruptor", "Prince of Lies", "the Bargainer", "Soultrader"],
    descriptions: [
      "Beauty and horror wed in impossible form.",
      "Speaks every language ever uttered.",
      "Bound here by ancient pact, seeking freedom.",
      "Collects souls like others collect coins."
    ]
  },
  {
    species: "undead",
    names: ["the Nameless King", "Dust-Lord", "He-Who-Was", "the Unremembered", "Bone-Emperor"],
    epithets: ["the Deathless", "Lord of Ashes", "the Eternal Hunger", "King of Graves"],
    descriptions: [
      "Once a great king, now animated by vengeance alone.",
      "Commands legions of the restless dead.",
      "Death itself fears to claim this one.",
      "Seeks the living to remember its forgotten name."
    ]
  },
  {
    species: "beast",
    names: ["the Nemean", "Fenrir-spawn", "Cerberus-kin", "Chimera Prime", "Behemoth"],
    epithets: ["the Untameable", "Eater of Heroes", "the Unstoppable", "Apex Predator"],
    descriptions: [
      "Hide that turns aside any blade.",
      "Hunts for sport, not hunger.",
      "Three times the size of any natural beast.",
      "Intelligence gleams in ancient eyes."
    ]
  },
  {
    species: "aberration",
    names: ["the Thing Below", "Star-Spawn", "the Unnameable", "That Which Waits", "the Dreamer"],
    epithets: ["from Beyond the Stars", "the Incomprehensible", "Madness-Bringer", "Reality-Render"],
    descriptions: [
      "Geometry that hurts to perceive.",
      "Existed before the gods were born.",
      "To look upon it is to forget sanity.",
      "Communicates in nightmares."
    ]
  }
];
var PROPHECY_TEMPLATES = [
  {
    template: "When %ACTOR% stands at the crossroads of %LOCATION%, the world shall tremble.",
    interpretation: "A great decision awaits."
  },
  {
    template: "Three signs herald the doom: %SIGN1%, %SIGN2%, and %SIGN3%. Then %ACTOR% shall rise.",
    interpretation: "Watch for the portents."
  },
  {
    template: "%WEAPON% shall be found again, and in the hands of %ACTOR%, kingdoms fall.",
    interpretation: "A legendary weapon seeks a wielder."
  },
  {
    template: "The blood of %ACTOR% shall water the fields of %LOCATION%, and from that sacrifice, hope blooms.",
    interpretation: "A hero must fall for others to rise."
  },
  {
    template: "When %MONSTER% wakes from its long slumber, only %ACTOR% can stand against it.",
    interpretation: "An ancient evil stirs."
  },
  {
    template: "The stars align once in a thousand years. At that hour, %LOCATION% shall burn or be reborn.",
    interpretation: "Celestial forces at work."
  },
  {
    template: "%ACTOR% shall betray %ACTOR2%, and in that betrayal, find either damnation or redemption.",
    interpretation: "Trust will be tested."
  },
  {
    template: "The child of %LOCATION% shall wear the crown of thorns, and weep for what they must become.",
    interpretation: "A reluctant hero emerges."
  }
];
var OMEN_SIGNS = [
  "a comet streaks across the sky",
  "the moon bleeds red",
  "birds fall dead from the sky",
  "fish swim upstream",
  "wolves howl at midday",
  "flowers bloom in winter",
  "snow falls in summer",
  "the dead walk briefly",
  "children speak in tongues",
  "statues weep blood",
  "wells run dry",
  "crops grow overnight",
  "animals speak prophecy",
  "the sun rises in the west",
  "shadows move against the light"
];
var TREASURE_TEMPLATES = [
  {
    type: "vault",
    names: ["The Vault of Kings", "The Emperor's Treasury", "The Dragon's Hoard", "The Forgotten Cache"],
    descriptions: [
      "Sealed for a thousand years, waiting for a worthy finder.",
      "The combined wealth of a dozen conquered kingdoms.",
      "Said to bankrupt empires with its contents."
    ]
  },
  {
    type: "tomb",
    names: ["The Tomb of the Nameless Pharaoh", "The Barrow of Heroes", "The Crypt of the Last King"],
    descriptions: [
      "Buried with treasures to shame the living.",
      "The dead king clutches his crown still.",
      "Grave goods worth more than cities."
    ]
  },
  {
    type: "library",
    names: ["The Library of Shadows", "The Arcane Archives", "The Forbidden Collection"],
    descriptions: [
      "Knowledge that could remake the world.",
      "Spells lost since the Age of Wonders.",
      "The collected wisdom of a dead civilization."
    ]
  },
  {
    type: "armory",
    names: ["The Armory of the Gods", "The Arsenal of Heroes", "The Weapon-Vault of Legend"],
    descriptions: [
      "Weapons forged for wars that ended the world.",
      "Every blade has slain a king.",
      "Armor worn by demigods."
    ]
  }
];
function generateLegendaryWeapon(rng, world) {
  const type = rng.pick(["sword", "axe", "spear", "bow", "mace", "dagger", "staff", "hammer"]);
  const name = rng.pick(WEAPON_NAMES[type]);
  return {
    id: `weapon-${Date.now()}-${rng.int(1000)}`,
    name,
    epithet: rng.pick(WEAPON_EPITHETS),
    type,
    material: rng.pick(WEAPON_MATERIALS),
    power: 7 + rng.int(4),
    curse: rng.chance(0.3) ? rng.pick(WEAPON_CURSES) : undefined,
    history: rng.pick(WEAPON_HISTORIES),
    discovered: false,
    sightings: 0
  };
}
function generateUniqueMonster(rng, world) {
  const template = rng.pick(UNIQUE_MONSTER_TEMPLATES);
  const territory = rng.pick(world.settlements).name;
  return {
    id: `monster-${Date.now()}-${rng.int(1000)}`,
    name: rng.pick(template.names),
    epithet: rng.pick(template.epithets),
    species: template.species,
    description: rng.pick(template.descriptions),
    threat: 8 + rng.int(3),
    territory,
    weakness: rng.chance(0.5) ? rng.pick([
      "Only vulnerable to silver.",
      "Cannot cross running water.",
      "Blinded by sunlight.",
      "Must be killed by the same weapon thrice.",
      "A specific ancient song weakens it.",
      "Only a sacrifice of love can end it."
    ]) : undefined,
    treasure: rng.chance(0.7) ? rng.pick([
      "guards a legendary weapon",
      "hoards the wealth of a fallen kingdom",
      "protects ancient knowledge",
      "sleeps upon a dragon's hoard"
    ]) : undefined,
    history: `Legends speak of ${template.names[0]} for as long as there have been storytellers.`,
    alive: true,
    sightings: 0
  };
}
function generateProphecy(rng, world, actors) {
  const template = rng.pick(PROPHECY_TEMPLATES);
  const actor1 = actors.length > 0 ? rng.pick(actors) : randomName(rng);
  const actor2 = actors.length > 1 ? rng.pick(actors.filter((a) => a !== actor1)) : randomName(rng);
  const location = rng.pick(world.settlements).name;
  let text = template.template.replace("%ACTOR%", actor1).replace("%ACTOR2%", actor2).replace("%LOCATION%", location).replace("%WEAPON%", rng.pick(WEAPON_NAMES.sword)).replace("%MONSTER%", rng.pick(UNIQUE_MONSTER_TEMPLATES).names[0]).replace("%SIGN1%", rng.pick(OMEN_SIGNS)).replace("%SIGN2%", rng.pick(OMEN_SIGNS)).replace("%SIGN3%", rng.pick(OMEN_SIGNS));
  return {
    id: `prophecy-${Date.now()}`,
    text,
    interpretation: template.interpretation,
    subjects: [actor1, actor2].filter(Boolean),
    fulfilled: false,
    announced: false
  };
}
function generateLostTreasure(rng, world) {
  const template = rng.pick(TREASURE_TEMPLATES);
  const location = rng.pick(world.settlements).name;
  return {
    id: `treasure-${Date.now()}`,
    name: rng.pick(template.names),
    type: template.type,
    description: rng.pick(template.descriptions),
    location,
    contents: [
      rng.pick(["gold beyond counting", "jewels by the bushel", "ancient coins", "silver ingots"]),
      rng.pick(["a legendary weapon", "priceless artifacts", "magical items", "relics of power"]),
      rng.pick(["forbidden knowledge", "lost spells", "ancient maps", "historical records"])
    ],
    guardian: rng.chance(0.7) ? rng.pick([
      "an ancient golem",
      "the restless dead",
      "a bound demon",
      "deadly traps",
      "a dragon",
      "a curse that kills intruders"
    ]) : undefined,
    discovered: false,
    looted: false,
    clues: [
      `An old map mentions ruins near ${location}.`,
      `A dying explorer spoke of treasures beyond imagining.`,
      `Ancient texts reference the ${template.names[0]}.`
    ]
  };
}
function maybeLegendarySpike(rng, world, worldTime, legendaryState) {
  const logs = [];
  if (rng.chance(0.08)) {
    const weapon = legendaryState.weapons.find((w) => !w.discovered) ?? generateLegendaryWeapon(rng, world);
    if (!legendaryState.weapons.includes(weapon)) {
      legendaryState.weapons.push(weapon);
    }
    weapon.sightings++;
    const settlement = rng.pick(world.settlements);
    logs.push({
      category: "town",
      summary: `Whispers of ${weapon.name} ${weapon.epithet}`,
      details: `A traveler speaks of a legendary ${weapon.type} of ${weapon.material}. ${weapon.history} ${weapon.curse ? `But beware: ${weapon.curse}` : ""}`,
      location: settlement.name,
      worldTime,
      realTime: new Date,
      seed: world.seed
    });
    queueConsequence({
      type: "spawn-rumor",
      triggerEvent: `Legendary weapon: ${weapon.name}`,
      turnsUntilResolution: 288 + rng.int(144),
      data: {
        origin: settlement.name,
        target: settlement.name,
        kind: "mystery",
        text: `Treasure-seekers speak of ${weapon.name}. Some say it lies in a forgotten ruin. Others claim a monster guards it.`
      },
      priority: 5
    });
  }
  if (rng.chance(0.06)) {
    const monster = legendaryState.monsters.find((m) => m.alive && m.sightings < 5) ?? generateUniqueMonster(rng, world);
    if (!legendaryState.monsters.includes(monster)) {
      legendaryState.monsters.push(monster);
    }
    monster.sightings++;
    monster.lastSeen = worldTime;
    logs.push({
      category: "road",
      summary: `${monster.name} ${monster.epithet} spotted near ${monster.territory}`,
      details: `${monster.description} Travelers flee in terror. ${monster.weakness ? `Ancient lore suggests: ${monster.weakness}` : "None know how to defeat such a creature."}`,
      location: monster.territory,
      actors: [monster.name],
      worldTime,
      realTime: new Date,
      seed: world.seed
    });
    const settlement = world.settlements.find((s) => s.name === monster.territory);
    if (settlement) {
      settlement.mood = Math.max(-5, settlement.mood - 2);
    }
  }
  if (rng.chance(0.05)) {
    const actors = [
      ...world.parties.map((p) => p.name),
      ...world.npcs.filter((n) => n.alive !== false && (n.fame ?? 0) >= 2).map((n) => n.name)
    ];
    if (actors.length > 0) {
      const prophecy = generateProphecy(rng, world, actors);
      legendaryState.prophecies.push(prophecy);
      prophecy.announced = true;
      const prophet = rng.pick(["an old hermit", "a dying oracle", "a child in a trance", "flames in a temple brazier", "a voice from the sky"]);
      const settlement = rng.pick(world.settlements);
      logs.push({
        category: "town",
        summary: `A prophecy is spoken in ${settlement.name}`,
        details: `${prophet.charAt(0).toUpperCase() + prophet.slice(1)} declares: "${prophecy.text}" ${prophecy.interpretation}`,
        location: settlement.name,
        actors: prophecy.subjects,
        worldTime,
        realTime: new Date,
        seed: world.seed
      });
    }
  }
  if (rng.chance(0.08)) {
    const treasure = legendaryState.treasures.find((t) => !t.discovered) ?? generateLostTreasure(rng, world);
    if (!legendaryState.treasures.includes(treasure)) {
      legendaryState.treasures.push(treasure);
    }
    const settlement = rng.pick(world.settlements);
    const clue = rng.pick(treasure.clues);
    logs.push({
      category: "town",
      summary: `Tales of ${treasure.name} surface in ${settlement.name}`,
      details: `${treasure.description} ${clue} ${treasure.guardian ? `Legends warn that ${treasure.guardian} protects it.` : ""}`,
      location: settlement.name,
      worldTime,
      realTime: new Date,
      seed: world.seed
    });
  }
  if (rng.chance(0.04)) {
    const omen = rng.pick(OMEN_SIGNS);
    const interpretation = rng.pick([
      "The priests are divided on what this means.",
      "The old tales speak of such signs before great change.",
      "Some weep with joy; others weep with terror.",
      "The wise prepare for what comes next."
    ]);
    logs.push({
      category: "weather",
      summary: `A great omen: ${omen}`,
      details: `Across the land, ${omen}. ${interpretation}`,
      worldTime,
      realTime: new Date,
      seed: world.seed
    });
    for (const settlement of world.settlements) {
      settlement.mood += rng.chance(0.5) ? 1 : -1;
      settlement.mood = Math.max(-5, Math.min(5, settlement.mood));
    }
  }
  return logs;
}
function createLegendaryState() {
  return {
    weapons: [],
    armor: [],
    monsters: [],
    prophecies: [],
    treasures: []
  };
}
function checkLegendaryEncounter(rng, party, location, legendaryState, worldTime, seed, world, antagonists, storyThreads) {
  const logs = [];
  const monstersHere = legendaryState.monsters.filter((m) => m.alive && m.territory === location);
  for (const monster of monstersHere) {
    if (rng.chance(0.05)) {
      const partyStrength = (party.fame ?? 0) + party.members.length * 2;
      const victory = partyStrength > monster.threat + rng.int(5);
      if (victory) {
        monster.alive = false;
        const deathEvent = {
          id: `slayer-${Date.now()}`,
          type: "death",
          timestamp: worldTime,
          location,
          actors: [party.name],
          victims: [monster.name],
          magnitude: 10,
          witnessed: true,
          data: { cause: "legendary battle", legendary: true }
        };
        logs.push(...processWorldEvent(deathEvent, world, rng, antagonists, storyThreads));
        logs.push({
          category: "road",
          summary: `${party.name} SLAYS ${monster.name} ${monster.epithet}!`,
          details: `Against all odds, they defeat the legendary ${monster.species}! ${monster.treasure ? `In its lair, they find ${monster.treasure}.` : ""} Songs will be sung for generations!`,
          location,
          actors: [party.name, monster.name],
          worldTime,
          realTime: new Date,
          seed
        });
        return logs;
      } else {
        party.wounded = true;
        party.restHoursRemaining = 48;
        logs.push({
          category: "road",
          summary: `${party.name} flees ${monster.name} ${monster.epithet}`,
          details: `The legendary ${monster.species} proves too powerful. They escape with their lives—barely.`,
          location,
          actors: [party.name, monster.name],
          worldTime,
          realTime: new Date,
          seed
        });
        return logs;
      }
    }
  }
  const undiscoveredWeapons = legendaryState.weapons.filter((w) => !w.discovered && w.sightings >= 3);
  for (const weapon of undiscoveredWeapons) {
    if (rng.chance(0.03)) {
      weapon.discovered = true;
      weapon.owner = party.name;
      weapon.location = location;
      const discoveryEvent = {
        id: `discovery-${Date.now()}`,
        type: "discovery",
        timestamp: worldTime,
        location,
        actors: [party.name],
        magnitude: 8,
        witnessed: true,
        data: { item: weapon.name, type: "legendary weapon" }
      };
      logs.push(...processWorldEvent(discoveryEvent, world, rng, antagonists, storyThreads));
      logs.push({
        category: "road",
        summary: `${party.name} discovers ${weapon.name} ${weapon.epithet}!`,
        details: `In a forgotten place, they find the legendary ${weapon.type} of ${weapon.material}. ${weapon.history} ${weapon.curse ? `But a dark truth emerges: ${weapon.curse}` : "A new chapter begins."}`,
        location,
        actors: [party.name],
        worldTime,
        realTime: new Date,
        seed
      });
      return logs;
    }
  }
  return logs;
}

// src/retainers.ts
var MONTHLY_WAGES = {
  torchbearer: 1,
  porter: 2,
  "man-at-arms": 4,
  squire: 3,
  acolyte: 2,
  apprentice: 2,
  scout: 10,
  sergeant: 20,
  bodyguard: 25,
  herald: 15,
  sage: 200,
  armorer: 100,
  weaponsmith: 100,
  "animal-trainer": 50,
  alchemist: 300,
  engineer: 150,
  spy: 125,
  assassin: 500,
  captain: 250,
  navigator: 150
};
function generateRetainer(rng, type, settlement, worldTime) {
  const isSpecialist = [
    "sage",
    "armorer",
    "weaponsmith",
    "animal-trainer",
    "alchemist",
    "engineer",
    "spy",
    "assassin",
    "captain",
    "navigator"
  ].includes(type);
  const level = isSpecialist ? 1 + rng.int(4) : rng.int(3);
  const baseHp = isSpecialist ? 6 + rng.int(8) : 4 + rng.int(6);
  let charClass;
  if (["man-at-arms", "squire", "sergeant", "bodyguard"].includes(type)) {
    charClass = "Fighter";
  } else if (type === "acolyte") {
    charClass = "Cleric";
  } else if (type === "apprentice") {
    charClass = "Magic-User";
  } else if (type === "scout") {
    charClass = rng.pick(["Thief", "Elf", "Halfling"]);
  }
  const baseLoyalty = 7 + rng.int(3) - 1;
  let specialty;
  if (type === "sage") {
    specialty = rng.pick(["history", "arcana", "religion", "nature", "geography", "languages", "monsters", "artifacts"]);
  } else if (type === "animal-trainer") {
    specialty = rng.pick(["horses", "dogs", "hawks", "war-beasts", "exotic"]);
  } else if (type === "engineer") {
    specialty = rng.pick(["fortifications", "siege-weapons", "bridges", "mines"]);
  }
  return {
    id: `retainer-${Date.now()}-${rng.int(1e4)}`,
    name: randomName(rng),
    type,
    level,
    class: charClass,
    hp: baseHp,
    maxHp: baseHp,
    loyalty: baseLoyalty,
    loyaltyModifier: 0,
    employerId: "",
    hiredAt: worldTime,
    lastPaid: worldTime,
    monthlyWage: MONTHLY_WAGES[type],
    alive: true,
    wounded: false,
    location: settlement,
    previousEmployers: [],
    betrayals: rng.chance(0.05) ? 1 : 0,
    heroicActs: 0,
    specialty
  };
}
function tickHiring(rng, roster, world, worldTime) {
  const logs = [];
  for (const pending of roster.pendingHires) {
    if (new Date(pending.searchCompletes) <= worldTime && pending.candidates.length === 0) {
      const candidateCount = 1 + rng.int(3);
      const settlement = world.settlements.find((s) => s.name === pending.settlement);
      const sizeBonus = settlement?.type === "city" ? 2 : settlement?.type === "town" ? 1 : 0;
      for (let i = 0;i < candidateCount; i++) {
        const candidate = generateRetainer(rng, pending.type, pending.settlement, worldTime);
        candidate.level = Math.min(candidate.level + sizeBonus, 5);
        pending.candidates.push(candidate);
      }
      const requester = world.parties.find((p) => p.id === pending.requesterId) ?? world.npcs.find((n) => n.id === pending.requesterId);
      logs.push({
        category: "town",
        summary: `${candidateCount} ${pending.type} candidates found in ${pending.settlement}`,
        details: `After days of inquiry, ${candidateCount} potential ${pending.type}s have been identified. ${requester?.name ?? "The employer"} must choose.`,
        location: pending.settlement,
        actors: pending.candidates.map((c) => c.name),
        worldTime,
        realTime: new Date,
        seed: world.seed
      });
    }
  }
  return logs;
}
function loyaltyCheck(rng, retainer, situation, world, worldTime) {
  const logs = [];
  const SITUATION_MODS = {
    combat: -2,
    danger: -1,
    unpaid: -3,
    "employer-wounded": -2,
    "better-offer": -2,
    hardship: -1
  };
  const modifier = SITUATION_MODS[situation] + retainer.loyaltyModifier;
  const roll = 2 + rng.int(11);
  const target = retainer.loyalty + modifier;
  const passed = roll <= target;
  if (!passed) {
    const severity = target - roll;
    if (severity <= -4 || situation === "better-offer") {
      retainer.betrayals++;
      const stolenGold = rng.int(50) + 10;
      logs.push({
        category: "town",
        summary: `${retainer.name} betrays their employer!`,
        details: `The ${retainer.type}'s loyalty breaks. They flee with ${stolenGold} gold, their oath forgotten.`,
        location: retainer.location,
        actors: [retainer.name],
        worldTime,
        realTime: new Date,
        seed: world.seed
      });
      const record = {
        retainerId: retainer.id,
        retainerName: retainer.name,
        employerId: retainer.employerId,
        reason: situation,
        timestamp: worldTime,
        betrayal: true,
        stolenGoods: stolenGold
      };
      retainer.alive = false;
    } else if (severity <= -2) {
      logs.push({
        category: "road",
        summary: `${retainer.name} deserts`,
        details: `Unable to face the ${situation}, the ${retainer.type} slips away in the night.`,
        location: retainer.location,
        actors: [retainer.name],
        worldTime,
        realTime: new Date,
        seed: world.seed
      });
      retainer.alive = false;
    } else {
      retainer.loyalty = Math.max(2, retainer.loyalty - 1);
      logs.push({
        category: "road",
        summary: `${retainer.name}'s loyalty wavers`,
        details: `The ${retainer.type} grumbles and hesitates. Their commitment is shaken.`,
        location: retainer.location,
        actors: [retainer.name],
        worldTime,
        realTime: new Date,
        seed: world.seed
      });
    }
  }
  return { passed, logs };
}
function tickRetainerPayday(rng, roster, world, worldTime) {
  const logs = [];
  if (worldTime.getUTCDate() !== 1)
    return logs;
  for (const retainer of roster.retainers) {
    if (!retainer.alive || !retainer.employerId)
      continue;
    const employer = world.parties.find((p) => p.id === retainer.employerId);
    const employerNpc = world.npcs.find((n) => n.id === retainer.employerId);
    const partyState = employer ? getPartyState(world, employer.id) : null;
    const canPay = partyState ? (partyState.resources ?? 0) >= retainer.monthlyWage : true;
    if (canPay) {
      retainer.lastPaid = worldTime;
      if (partyState) {
        partyState.resources = (partyState.resources ?? 0) - retainer.monthlyWage;
      }
      if (rng.chance(0.1)) {
        retainer.loyalty = Math.min(12, retainer.loyalty + 1);
      }
    } else {
      const check = loyaltyCheck(rng, retainer, "unpaid", world, worldTime);
      logs.push(...check.logs);
      if (check.passed) {
        logs.push({
          category: "town",
          summary: `${retainer.name} accepts late payment`,
          details: `Though wages are delayed, the ${retainer.type} remains loyal—for now.`,
          location: retainer.location,
          actors: [retainer.name],
          worldTime,
          realTime: new Date,
          seed: world.seed
        });
      }
    }
  }
  return logs;
}
function retainerHeroicAct(rng, retainer, actType, world, worldTime) {
  const logs = [];
  retainer.heroicActs++;
  retainer.loyalty = Math.min(12, retainer.loyalty + 2);
  const HEROIC_DESCRIPTIONS = {
    "save-employer": [
      `${retainer.name} throws themselves between their master and danger!`,
      `${retainer.name} drags their wounded employer to safety.`,
      `${retainer.name}'s quick thinking saves the day.`
    ],
    "hold-line": [
      `${retainer.name} holds the line while others retreat.`,
      `${retainer.name} refuses to give ground.`,
      `${retainer.name} buys precious time with blood and steel.`
    ],
    sacrifice: [
      `${retainer.name} gives their life so others may live.`,
      `${retainer.name} falls, but their sacrifice is not in vain.`,
      `${retainer.name}'s last act is one of selfless courage.`
    ]
  };
  const desc = rng.pick(HEROIC_DESCRIPTIONS[actType]);
  if (actType === "sacrifice") {
    retainer.alive = false;
    retainer.hp = 0;
  } else if (rng.chance(0.3)) {
    retainer.wounded = true;
    retainer.hp = Math.max(1, retainer.hp - rng.int(retainer.maxHp / 2));
  }
  logs.push({
    category: "road",
    summary: desc,
    details: actType === "sacrifice" ? `The ${retainer.type}'s name will be remembered. Their loyalty was beyond question.` : `The ${retainer.type}'s heroism inspires all who witness it. Their bond to their employer deepens.`,
    location: retainer.location,
    actors: [retainer.name],
    worldTime,
    realTime: new Date,
    seed: world.seed
  });
  return logs;
}
function checkPartyInheritance(rng, party, roster, world, worldTime) {
  const logs = [];
  const allDead = party.members.every((m) => m.hp <= 0);
  if (!allDead)
    return logs;
  const partyRetainers = roster.retainers.filter((r) => r.employerId === party.id && r.alive).sort((a, b) => {
    if (b.loyalty !== a.loyalty)
      return b.loyalty - a.loyalty;
    if (b.level !== a.level)
      return b.level - a.level;
    return b.heroicActs - a.heroicActs;
  });
  if (partyRetainers.length === 0) {
    logs.push({
      category: "road",
      summary: `${party.name} falls—none remain`,
      details: `With no heir and no loyal retainer to carry on, the company passes into legend.`,
      location: party.location,
      worldTime,
      realTime: new Date,
      seed: world.seed
    });
    return logs;
  }
  const heir = partyRetainers[0];
  const newMember = {
    name: heir.name,
    class: heir.class ?? "Fighter",
    level: Math.max(1, heir.level),
    hp: heir.hp,
    maxHp: heir.maxHp
  };
  party.members = [newMember];
  for (const r of partyRetainers.slice(1, 3)) {
    if (r.loyalty >= 9 && r.class) {
      party.members.push({
        name: r.name,
        class: r.class,
        level: Math.max(1, r.level),
        hp: r.hp,
        maxHp: r.maxHp
      });
      r.alive = false;
    }
  }
  heir.alive = false;
  logs.push({
    category: "road",
    summary: `${heir.name} inherits leadership of ${party.name}`,
    details: `From the ashes of tragedy, a new leader rises. The ${heir.type} ${heir.name} gathers the survivors and vows to continue.`,
    location: party.location,
    actors: [heir.name, party.name],
    worldTime,
    realTime: new Date,
    seed: world.seed
  });
  return logs;
}
function tickSpecialistProjects(rng, roster, world, worldTime) {
  const logs = [];
  for (const retainer of roster.retainers) {
    if (!retainer.alive || !retainer.projectType)
      continue;
    const progressPerHour = {
      research: 0.3,
      "craft-armor": 0.2,
      "craft-weapon": 0.25,
      "train-animal": 0.15,
      "brew-potion": 0.5,
      "build-engine": 0.1,
      "gather-intel": 0.4
    };
    const progress = progressPerHour[retainer.projectType] ?? 0.2;
    retainer.projectProgress = (retainer.projectProgress ?? 0) + progress;
    if (retainer.projectProgress >= 100) {
      retainer.projectProgress = 0;
      const projectType = retainer.projectType;
      retainer.projectType = undefined;
      logs.push({
        category: "town",
        summary: `${retainer.name} completes their ${projectType}`,
        details: `After weeks of dedicated work, the ${retainer.type}'s ${projectType} project is finished.`,
        location: retainer.location,
        actors: [retainer.name],
        worldTime,
        realTime: new Date,
        seed: world.seed
      });
    }
  }
  return logs;
}
function tickRetainers(rng, roster, world, worldTime) {
  const logs = [];
  logs.push(...tickHiring(rng, roster, world, worldTime));
  logs.push(...tickRetainerPayday(rng, roster, world, worldTime));
  logs.push(...tickSpecialistProjects(rng, roster, world, worldTime));
  if (rng.chance(0.01)) {
    const activeRetainers = roster.retainers.filter((r) => r.alive);
    if (activeRetainers.length > 0) {
      const retainer = rng.pick(activeRetainers);
      if (rng.chance(0.5) && retainer.loyalty <= 6) {
        const check = loyaltyCheck(rng, retainer, "hardship", world, worldTime);
        logs.push(...check.logs);
      } else if (rng.chance(0.3) && retainer.loyalty >= 10) {
        logs.push(...retainerHeroicAct(rng, retainer, "hold-line", world, worldTime));
      }
    }
  }
  for (const party of world.parties) {
    logs.push(...checkPartyInheritance(rng, party, roster, world, worldTime));
  }
  return logs;
}
function createRetainerRoster() {
  return {
    retainers: [],
    pendingHires: [],
    desertions: []
  };
}

// src/guilds.ts
var GUILD_NAMES = [
  "Shadow Hand",
  "Black Masks",
  "Night Knives",
  "Silent Coin",
  "Velvet Glove",
  "Iron Rats",
  "Golden Shadows",
  "Crimson Purse",
  "Twilight Fingers",
  "Whisper Guild",
  "Dark Lantern",
  "Pale Hand",
  "Silver Serpents",
  "Dead Man's Purse",
  "Ghost Coin"
];
var GUILD_EPITHETS = [
  "masters of the underworld",
  "rulers of the shadows",
  "keepers of secrets",
  "merchants of the night",
  "princes of thieves",
  "children of the dark"
];
function generateGuild(rng, settlement, world, worldTime) {
  const name = rng.pick(GUILD_NAMES);
  const guildmasterName = randomName(rng);
  const guild = {
    id: `guild-${Date.now()}-${rng.int(1e4)}`,
    name: `The ${name}`,
    epithet: rng.pick(GUILD_EPITHETS),
    territory: [settlement],
    headquarters: settlement,
    guildmasterId: `guildmaster-${Date.now()}`,
    lieutenants: [],
    operatives: [],
    treasury: 100 + rng.int(500),
    infamy: 10 + rng.int(30),
    heat: rng.int(20),
    secrets: [],
    informants: [],
    enemies: [],
    allies: [],
    active: true,
    foundedAt: worldTime
  };
  const operativeCount = 5 + rng.int(8);
  for (let i = 0;i < operativeCount; i++) {
    guild.operatives.push({
      npcId: `thief-${Date.now()}-${i}`,
      name: randomName(rng),
      rank: i < 2 ? "lieutenant" : i < 5 ? "operative" : "apprentice",
      specialty: rng.pick(["heist", "pickpocket", "burglary", "fence", "smuggling"]),
      skill: 3 + rng.int(5),
      loyalty: 7 + rng.int(3),
      heistsCompleted: rng.int(10),
      arrested: rng.int(2),
      joinedAt: new Date(worldTime.getTime() - rng.int(365 * 24 * 60 * 60 * 1000))
    });
  }
  guild.lieutenants = guild.operatives.filter((o) => o.rank === "lieutenant").map((o) => o.npcId);
  return guild;
}
function planHeist(rng, guild, targetType, targetId, targetName, targetLocation, estimatedValue, guildState, worldTime) {
  const logs = [];
  const PLANNING_TIME = {
    caravan: { min: 48, max: 96 },
    vault: { min: 120, max: 240 },
    noble: { min: 96, max: 168 },
    merchant: { min: 48, max: 96 },
    guild: { min: 168, max: 336 },
    temple: { min: 120, max: 240 },
    person: { min: 24, max: 72 }
  };
  const timing = PLANNING_TIME[targetType];
  const planningHours = timing.min + rng.int(timing.max - timing.min);
  const availableOperatives = guild.operatives.filter((o) => o.rank !== "apprentice");
  if (availableOperatives.length === 0) {
    return logs;
  }
  const teamSize = Math.min(availableOperatives.length, 2 + rng.int(3));
  const team = availableOperatives.slice(0, teamSize);
  const leader = team.sort((a, b) => b.skill - a.skill)[0];
  const riskLevel = targetType === "vault" ? 8 + rng.int(3) : targetType === "noble" ? 6 + rng.int(3) : targetType === "guild" ? 9 + rng.int(2) : targetType === "temple" ? 7 + rng.int(3) : 4 + rng.int(4);
  const operation = {
    id: `op-${Date.now()}-${rng.int(1e4)}`,
    guildId: guild.id,
    type: "heist",
    status: "planning",
    planningStarted: worldTime,
    planningCompletes: new Date(worldTime.getTime() + planningHours * 60 * 60 * 1000),
    targetType,
    targetId,
    targetName,
    targetLocation,
    leaderId: leader.npcId,
    teamIds: team.map((t) => t.npcId),
    estimatedTake: estimatedValue,
    riskLevel,
    casualties: [],
    discovered: false,
    witnesses: []
  };
  guildState.operations.push(operation);
  const daysApprox = Math.round(planningHours / 24);
  logs.push({
    category: "town",
    summary: `${guild.name} plans a job against ${targetName}`,
    details: `The ${guild.epithet} have set their sights on a ${targetType}. ${leader.name} leads the planning. It will take approximately ${daysApprox} days to prepare.`,
    location: guild.headquarters,
    actors: [guild.name, leader.name],
    worldTime,
    realTime: new Date,
    seed: ""
  });
  return logs;
}
function executeHeist(rng, operation, guild, guildState, world, worldTime) {
  const logs = [];
  const teamSkill = operation.teamIds.reduce((sum, id) => {
    const member = guild.operatives.find((o) => o.npcId === id);
    return sum + (member?.skill ?? 3);
  }, 0) / operation.teamIds.length;
  const successChance = 0.5 + teamSkill / 20 - operation.riskLevel / 20;
  const success = rng.chance(successChance);
  const executionHours = 2 + rng.int(7);
  operation.executionStarted = worldTime;
  operation.executionCompletes = new Date(worldTime.getTime() + executionHours * 60 * 60 * 1000);
  operation.status = "active";
  if (success) {
    operation.status = "completed";
    const takeMultiplier = 0.6 + rng.next() * 0.8;
    operation.actualTake = Math.floor(operation.estimatedTake * takeMultiplier);
    guild.treasury += operation.actualTake;
    guild.infamy += 2;
    const settlement = world.settlements.find((s) => s.name === operation.targetLocation);
    if (settlement) {
      settlement.mood = Math.max(-5, settlement.mood - 1);
    }
    for (const memberId of operation.teamIds) {
      const member = guild.operatives.find((o) => o.npcId === memberId);
      if (member)
        member.heistsCompleted++;
    }
    operation.discovered = rng.chance(0.3 - teamSkill / 30);
    if (operation.discovered) {
      guild.heat += 10 + rng.int(10);
    }
    guildState.hotGoods.push({
      id: `goods-${Date.now()}`,
      guildId: guild.id,
      stolenFrom: operation.targetName,
      stolenAt: worldTime,
      type: operation.targetType === "caravan" ? "trade goods" : operation.targetType === "noble" ? "jewelry and valuables" : operation.targetType === "vault" ? "coin and treasures" : "stolen merchandise",
      value: operation.actualTake,
      fenceValue: Math.floor(operation.actualTake * (0.3 + rng.next() * 0.3)),
      heat: operation.discovered ? 80 + rng.int(20) : 20 + rng.int(30)
    });
    logs.push({
      category: "town",
      summary: `${guild.name} pulls off a heist on ${operation.targetName}`,
      details: `${operation.actualTake} gold worth of goods vanish in the night. ${operation.discovered ? "Suspicion falls on known criminal elements." : "The perpetrators leave no trace."}`,
      location: operation.targetLocation,
      actors: [guild.name],
      worldTime,
      realTime: new Date,
      seed: world.seed
    });
  } else {
    operation.status = "failed";
    operation.discovered = true;
    guild.heat += 20 + rng.int(20);
    for (const memberId of operation.teamIds) {
      if (rng.chance(0.2)) {
        const member = guild.operatives.find((o) => o.npcId === memberId);
        if (member) {
          operation.casualties.push(memberId);
          if (rng.chance(0.5)) {
            guild.operatives = guild.operatives.filter((o) => o.npcId !== memberId);
            logs.push({
              category: "town",
              summary: `${member.name} slain during botched heist`,
              details: `The ${operation.targetType} was better protected than expected. ${member.name} paid the ultimate price.`,
              location: operation.targetLocation,
              worldTime,
              realTime: new Date,
              seed: world.seed
            });
          } else {
            member.arrested++;
            logs.push({
              category: "town",
              summary: `${member.name} arrested for attempted theft`,
              details: `The watch drags away a member of ${guild.name}. How much will they talk?`,
              location: operation.targetLocation,
              actors: [member.name],
              worldTime,
              realTime: new Date,
              seed: world.seed
            });
          }
        }
      }
    }
    if (operation.casualties.length === 0) {
      logs.push({
        category: "town",
        summary: `${guild.name}'s heist on ${operation.targetName} fails`,
        details: `Alarms are raised. The thieves flee empty-handed into the night.`,
        location: operation.targetLocation,
        actors: [guild.name],
        worldTime,
        realTime: new Date,
        seed: world.seed
      });
    }
  }
  return logs;
}
function tickFencing(rng, guildState, world, worldTime) {
  const logs = [];
  for (const goods of guildState.hotGoods) {
    if (goods.fencedAt)
      continue;
    const guild = guildState.guilds.find((g) => g.id === goods.guildId);
    if (!guild)
      continue;
    const hoursSinceTheft = (worldTime.getTime() - new Date(goods.stolenAt).getTime()) / (60 * 60 * 1000);
    const coolingPerHour = 0.3;
    goods.heat = Math.max(0, goods.heat - coolingPerHour);
    if (hoursSinceTheft >= 24 && goods.heat < 50) {
      const fenceChance = (100 - goods.heat) / 200;
      if (rng.chance(fenceChance)) {
        goods.fencedAt = worldTime;
        guild.treasury += goods.fenceValue;
        logs.push({
          category: "town",
          summary: `${guild.name} moves stolen goods`,
          details: `The ${goods.type} from ${goods.stolenFrom} finally finds a buyer. ${goods.fenceValue} gold changes hands in a shadowy transaction.`,
          location: guild.headquarters,
          actors: [guild.name],
          worldTime,
          realTime: new Date,
          seed: world.seed
        });
      }
    }
  }
  guildState.hotGoods = guildState.hotGoods.filter((g) => !g.fencedAt);
  return logs;
}
function discoverSecret(rng, guild, targetId, targetName, world, worldTime) {
  const SECRET_TYPES = [
    { type: "affair", severity: 5 + rng.int(3), value: 50 + rng.int(200) },
    { type: "debt", severity: 3 + rng.int(4), value: 30 + rng.int(100) },
    { type: "crime", severity: 6 + rng.int(4), value: 100 + rng.int(300) },
    { type: "scandal", severity: 4 + rng.int(4), value: 50 + rng.int(150) },
    { type: "conspiracy", severity: 8 + rng.int(3), value: 200 + rng.int(500) },
    { type: "identity", severity: 7 + rng.int(4), value: 150 + rng.int(350) }
  ];
  const template = rng.pick(SECRET_TYPES);
  return {
    id: `secret-${Date.now()}-${rng.int(1e4)}`,
    targetId,
    targetName,
    type: template.type,
    severity: template.severity,
    knownBy: [guild.id],
    discoveredAt: worldTime,
    monetaryValue: template.value,
    usedForBlackmail: false
  };
}
function executeAssassination(rng, operation, guild, guildState, world, worldTime) {
  const logs = [];
  const assassin = guild.operatives.find((o) => o.npcId === operation.leaderId);
  if (!assassin)
    return logs;
  const successChance = 0.3 + assassin.skill / 15;
  const success = rng.chance(successChance);
  if (success) {
    operation.status = "completed";
    operation.actualTake = operation.estimatedTake;
    guild.treasury += operation.estimatedTake;
    guild.infamy += 10;
    assassin.heistsCompleted++;
    operation.discovered = rng.chance(0.4);
    if (operation.discovered) {
      guild.heat += 30;
    }
    const targetNpc = world.npcs.find((n) => n.id === operation.targetId || n.name === operation.targetName);
    if (targetNpc) {
      targetNpc.alive = false;
      const event = {
        id: `assassination-${Date.now()}`,
        type: "assassination",
        timestamp: worldTime,
        location: operation.targetLocation,
        actors: [guild.name],
        victims: [operation.targetName],
        perpetrators: [guild.name],
        magnitude: 8,
        witnessed: operation.discovered,
        data: { cause: "contract killing" }
      };
      queueConsequence({
        type: "spawn-event",
        triggerEvent: `Assassination of ${operation.targetName}`,
        turnsUntilResolution: 1,
        data: event,
        priority: 5
      });
    }
    logs.push({
      category: "town",
      summary: `${operation.targetName} found dead`,
      details: operation.discovered ? `Poison. Blade. No witnesses—almost. Word on the street points to ${guild.name}.` : `A sudden death. Natural causes, they say. But those who know, know better.`,
      location: operation.targetLocation,
      actors: [operation.targetName],
      worldTime,
      realTime: new Date,
      seed: world.seed
    });
  } else {
    operation.status = "failed";
    operation.discovered = true;
    guild.heat += 40;
    if (rng.chance(0.4)) {
      guild.operatives = guild.operatives.filter((o) => o.npcId !== assassin.npcId);
      operation.casualties.push(assassin.npcId);
      logs.push({
        category: "town",
        summary: `Assassination attempt on ${operation.targetName} foiled`,
        details: `${assassin.name} is slain in the attempt. ${guild.name}'s involvement is exposed.`,
        location: operation.targetLocation,
        actors: [operation.targetName, assassin.name],
        worldTime,
        realTime: new Date,
        seed: world.seed
      });
    } else {
      assassin.arrested++;
      logs.push({
        category: "town",
        summary: `Assassination attempt on ${operation.targetName} foiled`,
        details: `The would-be killer escapes into the shadows. ${operation.targetName} lives—for now.`,
        location: operation.targetLocation,
        actors: [operation.targetName],
        worldTime,
        realTime: new Date,
        seed: world.seed
      });
    }
  }
  return logs;
}
function tickGuildWars(rng, guildState, world, worldTime) {
  const logs = [];
  for (const guild of guildState.guilds) {
    if (!guild.active)
      continue;
    for (const otherGuild of guildState.guilds) {
      if (otherGuild.id === guild.id || !otherGuild.active)
        continue;
      const sharedTerritory = guild.territory.filter((t) => otherGuild.territory.includes(t));
      if (sharedTerritory.length === 0)
        continue;
      const isEnemy = guild.enemies.includes(otherGuild.id);
      const conflictChance = isEnemy ? 0.05 : 0.01;
      if (rng.chance(conflictChance)) {
        const territory = rng.pick(sharedTerritory);
        const guildStrength = guild.operatives.length + guild.infamy / 10;
        const otherStrength = otherGuild.operatives.length + otherGuild.infamy / 10;
        const guildWins = guildStrength + rng.int(10) > otherStrength + rng.int(10);
        const winner = guildWins ? guild : otherGuild;
        const loser = guildWins ? otherGuild : guild;
        const loserCasualties = 1 + rng.int(2);
        for (let i = 0;i < loserCasualties && loser.operatives.length > 2; i++) {
          const victim = loser.operatives[loser.operatives.length - 1];
          loser.operatives.pop();
          if (rng.chance(0.5)) {
            logs.push({
              category: "town",
              summary: `${victim.name} killed in guild war`,
              details: `The streets of ${territory} run red as ${guild.name} and ${otherGuild.name} clash.`,
              location: territory,
              worldTime,
              realTime: new Date,
              seed: world.seed
            });
          }
        }
        if (!guild.enemies.includes(otherGuild.id)) {
          guild.enemies.push(otherGuild.id);
          otherGuild.enemies.push(guild.id);
        }
        if (winner.operatives.length > loser.operatives.length * 2) {
          loser.territory = loser.territory.filter((t) => t !== territory);
          logs.push({
            category: "faction",
            summary: `${winner.name} drives ${loser.name} from ${territory}`,
            details: `The guild war ends decisively. ${territory} belongs to ${winner.name} now.`,
            location: territory,
            actors: [winner.name, loser.name],
            worldTime,
            realTime: new Date,
            seed: world.seed
          });
        }
      }
    }
  }
  return logs;
}
function tickProtectionRackets(rng, guildState, world, worldTime) {
  const logs = [];
  if (worldTime.getUTCDate() !== 1)
    return logs;
  for (const guild of guildState.guilds) {
    if (!guild.active)
      continue;
    for (const territory of guild.territory) {
      const settlement = world.settlements.find((s) => s.name === territory);
      if (!settlement)
        continue;
      const baseCollection = settlement.type === "city" ? 100 : settlement.type === "town" ? 50 : 20;
      const collection = Math.floor(baseCollection * (1 + guild.infamy / 100));
      guild.treasury += collection;
      guild.heat += 2;
      if (rng.chance(0.05)) {
        const merchant = randomName(rng);
        if (rng.chance(0.3)) {
          logs.push({
            category: "town",
            summary: `Merchant refuses ${guild.name}'s "protection"`,
            details: `${merchant} stands up to the guild. A brave but perhaps foolish act.`,
            location: territory,
            actors: [merchant, guild.name],
            worldTime,
            realTime: new Date,
            seed: world.seed
          });
          queueConsequence({
            type: "spawn-event",
            triggerEvent: `${merchant} defiance`,
            turnsUntilResolution: 24 + rng.int(48),
            data: {
              category: "town",
              summary: `${merchant}'s shop burns`,
              details: `A midnight fire. No one is surprised. The message is clear.`,
              location: territory
            },
            priority: 3
          });
        }
      }
    }
  }
  return logs;
}
function tickGuilds(rng, guildState, world, worldTime) {
  const logs = [];
  for (const operation of guildState.operations) {
    const guild = guildState.guilds.find((g) => g.id === operation.guildId);
    if (!guild || !guild.active)
      continue;
    if (operation.status === "planning" && new Date(operation.planningCompletes) <= worldTime) {
      if (operation.type === "heist") {
        logs.push(...executeHeist(rng, operation, guild, guildState, world, worldTime));
      } else if (operation.type === "assassination") {
        logs.push(...executeAssassination(rng, operation, guild, guildState, world, worldTime));
      }
    }
  }
  guildState.operations = guildState.operations.filter((op) => op.status === "planning" || op.status === "active" || worldTime.getTime() - new Date(op.planningStarted).getTime() < 7 * 24 * 60 * 60 * 1000);
  logs.push(...tickFencing(rng, guildState, world, worldTime));
  logs.push(...tickProtectionRackets(rng, guildState, world, worldTime));
  logs.push(...tickGuildWars(rng, guildState, world, worldTime));
  for (const guild of guildState.guilds) {
    guild.heat = Math.max(0, guild.heat - 0.5);
  }
  if (rng.chance(0.02)) {
    const activeGuilds = guildState.guilds.filter((g) => g.active);
    if (activeGuilds.length > 0) {
      const guild = rng.pick(activeGuilds);
      if (guild.informants.length > 0 || rng.chance(0.3)) {
        const targets = world.npcs.filter((n) => n.alive !== false && (n.fame ?? 0) >= 2 && !guild.secrets.some((s) => s.targetId === n.id));
        if (targets.length > 0) {
          const target = rng.pick(targets);
          const secret = discoverSecret(rng, guild, target.id, target.name, world, worldTime);
          if (secret) {
            guild.secrets.push(secret);
            logs.push({
              category: "town",
              summary: `${guild.name} uncovers a secret about ${target.name}`,
              details: `The ${secret.type} will fetch a pretty price—one way or another.`,
              location: guild.headquarters,
              actors: [guild.name, target.name],
              worldTime,
              realTime: new Date,
              seed: world.seed
            });
          }
        }
      }
      if (guild.treasury >= 50 && guildState.operations.filter((o) => o.guildId === guild.id && o.status === "planning").length < 2) {
        const territory = rng.pick(guild.territory);
        const settlement = world.settlements.find((s) => s.name === territory);
        if (settlement) {
          const caravans = world.caravans.filter((c) => c.location === territory || c.route.some((r) => {
            const s = world.settlements.find((s2) => s2.id === r);
            return s?.name === territory;
          }));
          if (caravans.length > 0 && rng.chance(0.5)) {
            const caravan = rng.pick(caravans);
            logs.push(...planHeist(rng, guild, "caravan", caravan.id, caravan.name, territory, 100 + rng.int(200), guildState, worldTime));
          } else {
            const merchantValue = 50 + rng.int(150);
            logs.push(...planHeist(rng, guild, "merchant", `merchant-${Date.now()}`, `a ${territory} merchant`, territory, merchantValue, guildState, worldTime));
          }
        }
      }
    }
  }
  return logs;
}
function createGuildState() {
  return {
    guilds: [],
    operations: [],
    hotGoods: []
  };
}
function seedGuilds(rng, world, worldTime) {
  const state = createGuildState();
  for (const settlement of world.settlements) {
    if (settlement.type === "city") {
      state.guilds.push(generateGuild(rng, settlement.name, world, worldTime));
      if (rng.chance(0.7)) {
        const secondGuild = generateGuild(rng, settlement.name, world, worldTime);
        state.guilds.push(secondGuild);
        state.guilds[state.guilds.length - 2].enemies.push(secondGuild.id);
        secondGuild.enemies.push(state.guilds[state.guilds.length - 2].id);
      }
    } else if (settlement.type === "town" && rng.chance(0.6)) {
      state.guilds.push(generateGuild(rng, settlement.name, world, worldTime));
    }
  }
  return state;
}

// src/ecology.ts
var ALL_SPECIES = [
  "orc",
  "goblin",
  "kobold",
  "gnoll",
  "hobgoblin",
  "bugbear",
  "lizardfolk",
  "troglodyte",
  "gnome",
  "duergar",
  "derro",
  "kuo-toa",
  "sahuagin",
  "locathah",
  "bullywug",
  "grippli",
  "kenku",
  "tengu",
  "jackalwere",
  "wererat",
  "werebear",
  "werewolf",
  "wereboar",
  "weretiger",
  "rakshasa",
  "yuan-ti",
  "naga-guardian",
  "centaur",
  "satyr",
  "sprite",
  "pixie",
  "nixie",
  "dryad",
  "nereid",
  "sylph",
  "skeleton",
  "zombie",
  "ghoul",
  "wight",
  "wraith",
  "vampire-spawn",
  "shadow",
  "specter",
  "banshee",
  "ghost",
  "poltergeist",
  "haunt",
  "phantom",
  "mummy",
  "lich-spawn",
  "death-knight",
  "revenant",
  "draugr",
  "barrow-wight",
  "bone-golem",
  "corpse-crawler",
  "rot-grub-swarm",
  "will-o-wisp",
  "groaning-spirit",
  "wolf",
  "dire-wolf",
  "bear",
  "giant-spider",
  "giant-rat",
  "worg",
  "giant-ant",
  "giant-beetle",
  "giant-centipede",
  "giant-scorpion",
  "giant-wasp",
  "giant-snake",
  "giant-constrictor",
  "giant-lizard",
  "giant-toad",
  "giant-frog",
  "giant-crab",
  "giant-octopus",
  "giant-eel",
  "giant-pike",
  "giant-shark",
  "giant-eagle",
  "giant-owl",
  "giant-hawk",
  "giant-raven",
  "giant-bat",
  "giant-boar",
  "giant-elk",
  "giant-weasel",
  "giant-badger",
  "giant-wolverine",
  "dire-bear",
  "dire-boar",
  "dire-lion",
  "dire-tiger",
  "saber-tooth",
  "cave-bear",
  "cave-lion",
  "mammoth",
  "mastodon",
  "woolly-rhino",
  "crocodile",
  "giant-crocodile",
  "python",
  "viper",
  "cobra",
  "asp",
  "swarm-of-bats",
  "swarm-of-rats",
  "swarm-of-insects",
  "swarm-of-spiders",
  "young-dragon",
  "drake",
  "wyvern",
  "white-dragon",
  "black-dragon",
  "green-dragon",
  "blue-dragon",
  "red-dragon",
  "brass-dragon",
  "bronze-dragon",
  "copper-dragon",
  "silver-dragon",
  "gold-dragon",
  "fire-drake",
  "ice-drake",
  "swamp-drake",
  "forest-drake",
  "sea-drake",
  "pseudodragon",
  "faerie-dragon",
  "dragon-turtle",
  "hydra",
  "pyrohydra",
  "ogre",
  "troll",
  "hill-giant",
  "frost-giant",
  "fire-giant",
  "stone-giant",
  "cloud-giant",
  "storm-giant",
  "mountain-giant",
  "sea-giant",
  "cyclops",
  "ettin",
  "fomorian",
  "athach",
  "verbeeg",
  "ogre-mage",
  "oni",
  "troll-ice",
  "troll-rock",
  "troll-war",
  "orc-warchief",
  "orc-shaman",
  "orc-berserker",
  "half-orc-bandit",
  "goblin-worg-rider",
  "goblin-shaman",
  "goblin-king",
  "hobgoblin-captain",
  "hobgoblin-warlord",
  "hobgoblin-devastator",
  "bugbear-chief",
  "bugbear-stalker",
  "carrion-crawler",
  "rust-monster",
  "otyugh",
  "neo-otyugh",
  "grell",
  "hook-horror",
  "umber-hulk",
  "xorn",
  "roper",
  "piercer",
  "lurker-above",
  "trapper",
  "cloaker",
  "darkmantle",
  "choker",
  "grick",
  "intellect-devourer",
  "mind-flayer",
  "aboleth",
  "beholder",
  "beholder-kin",
  "eye-of-the-deep",
  "gibbering-mouther",
  "chaos-beast",
  "phasm",
  "mimic",
  "doppelganger",
  "gray-ooze",
  "ochre-jelly",
  "black-pudding",
  "gelatinous-cube",
  "green-slime",
  "mustard-jelly",
  "olive-slime",
  "crystal-ooze",
  "slithering-tracker",
  "id-ooze",
  "animated-armor",
  "flying-sword",
  "golem-flesh",
  "golem-clay",
  "golem-stone",
  "golem-iron",
  "golem-bronze",
  "golem-wood",
  "scarecrow",
  "gargoyle",
  "shield-guardian",
  "helmed-horror",
  "homunculus",
  "marionette",
  "living-statue",
  "fire-elemental",
  "water-elemental",
  "earth-elemental",
  "air-elemental",
  "magma-elemental",
  "ice-elemental",
  "mud-elemental",
  "smoke-elemental",
  "fire-mephit",
  "ice-mephit",
  "dust-mephit",
  "steam-mephit",
  "salt-mephit",
  "salamander",
  "azer",
  "magmin",
  "thoqqua",
  "galeb-duhr",
  "dao",
  "djinni",
  "efreeti",
  "marid",
  "imp",
  "quasit",
  "dretch",
  "manes",
  "lemure",
  "nupperibo",
  "hell-hound",
  "nightmare",
  "barghest",
  "shadow-demon",
  "vrock",
  "hezrou",
  "glabrezu",
  "nalfeshnee",
  "succubus",
  "incubus",
  "cambion",
  "bearded-devil",
  "chain-devil",
  "bone-devil",
  "horned-devil",
  "ice-devil",
  "night-hag",
  "green-hag",
  "sea-hag",
  "annis-hag",
  "coven-hag",
  "lantern-archon",
  "hound-archon",
  "astral-deva",
  "planetar",
  "solar",
  "pegasus",
  "unicorn",
  "ki-rin",
  "couatl",
  "shedu",
  "lammasu",
  "sphinx",
  "harpy",
  "manticore",
  "griffon",
  "hippogriff",
  "chimera",
  "peryton",
  "cockatrice",
  "stymphalian-bird",
  "roc",
  "thunderbird",
  "giant-vulture",
  "stirge",
  "dire-bat",
  "mobat",
  "giant-mosquito",
  "blood-hawk",
  "basilisk",
  "gorgon",
  "catoblepas",
  "medusa",
  "giant-basilisk",
  "dracolisk",
  "pyrolisk",
  "sea-serpent",
  "linnorm",
  "amphisbaena",
  "jormungandr-spawn",
  "quetzalcoatl-spawn",
  "cave-fisher",
  "myconid",
  "shrieker",
  "violet-fungus",
  "gas-spore",
  "vegepygmy",
  "phantom-fungus",
  "ascomoid",
  "basidirond",
  "drow",
  "drow-priestess",
  "drow-mage",
  "drider",
  "deep-gnome",
  "merfolk",
  "triton",
  "sea-elf",
  "siren",
  "selkie",
  "merrow",
  "scrag",
  "kapoacinth",
  "kelpie",
  "vodyanoi",
  "kraken-spawn",
  "aboleth-spawn",
  "chuul",
  "kopru",
  "ixitxachitl",
  "minotaur",
  "owlbear",
  "displacer-beast",
  "blink-dog",
  "phase-spider",
  "bulette",
  "ankheg",
  "purple-worm",
  "remorhaz",
  "leucrotta",
  "caterwaul",
  "su-monster",
  "thoul",
  "shambling-mound",
  "treant",
  "tendriculos",
  "assassin-vine",
  "blood-tree",
  "phantom-warrior",
  "death-dog",
  "bonesnapper",
  "osquip",
  "jermlaine",
  "tarrasque",
  "elder-brain",
  "kraken",
  "leviathan",
  "phoenix",
  "titan",
  "empyrean",
  "astral-dreadnought",
  "nightwalker"
];
function inferSpeciesConfig(species) {
  const name = species.toLowerCase();
  let category = "beast";
  if (/orc|goblin|kobold|gnoll|hobgoblin|bugbear|lizard|trog|gnome|duergar|derro|kuo|sahuagin|locathah|bully|gripp|kenku|tengu|were|yuan|naga|centaur|satyr|sprite|pixie|nixie|dryad|nereid|sylph|merfolk|triton|elf|drow|deep-gnome/.test(name))
    category = "humanoid";
  if (/skeleton|zombie|ghoul|wight|wraith|vampire|shadow|specter|banshee|ghost|poltergeist|haunt|phantom|mummy|lich|death-knight|revenant|draugr|barrow|bone-golem|corpse|rot-grub|will-o|groaning/.test(name))
    category = "undead";
  if (/dragon|drake|wyvern|hydra|pyro/.test(name))
    category = "dragon";
  if (/giant|cyclops|ettin|fomorian|athach|verbeeg|ogre|troll|oni/.test(name))
    category = "giant";
  if (/demon|devil|imp|quasit|dretch|manes|lemure|hell-hound|nightmare|barghest|vrock|hezrou|glabrezu|nalfeshnee|succubus|incubus|cambion|chain-devil|bone-devil|horned|ice-devil|hag|fiend/.test(name))
    category = "demon";
  if (/archon|deva|planetar|solar|pegasus|unicorn|ki-rin|couatl|shedu|lammasu|sphinx|phoenix/.test(name))
    category = "fey";
  if (/elemental|mephit|salamander|azer|magmin|thoqqua|galeb|dao|djinni|efreeti|marid/.test(name))
    category = "elemental";
  if (/golem|animated|flying-sword|scarecrow|gargoyle|shield-guardian|helmed|homunculus|marionette|living-statue/.test(name))
    category = "construct";
  if (/ooze|jelly|pudding|cube|slime|slither|id-ooze|carrion|rust|otyugh|grell|hook|umber|xorn|roper|piercer|lurker|trapper|cloaker|darkmantle|choker|grick|intellect|mind-flayer|aboleth|beholder|gibbering|chaos|phasm|mimic|doppel/.test(name))
    category = "aberration";
  let basePop = { min: 5, max: 20 };
  if (/swarm|horde|colony/.test(name))
    basePop = { min: 30, max: 100 };
  if (/giant|dire|dragon|hydra|titan|tarrasque|kraken|leviathan|roc|purple-worm|elder/.test(name))
    basePop = { min: 1, max: 3 };
  if (/kobold|goblin|rat|ant|beetle/.test(name))
    basePop = { min: 20, max: 80 };
  if (/orc|gnoll|hobgoblin|lizardfolk/.test(name))
    basePop = { min: 15, max: 50 };
  if (/lich|beholder|mind-flayer|aboleth|medusa|sphinx/.test(name))
    basePop = { min: 1, max: 1 };
  let growthRate = 0.03;
  if (category === "undead" || category === "construct")
    growthRate = 0;
  if (/rat|ant|beetle|swarm|kobold|goblin/.test(name))
    growthRate = 0.06;
  if (/dragon|giant|titan|tarrasque|lich|beholder/.test(name))
    growthRate = 0.005;
  if (/orc|gnoll|hobgoblin/.test(name))
    growthRate = 0.04;
  let aggression = 5;
  if (/demon|devil|undead|shadow|wraith|vampire/.test(name))
    aggression = 8;
  if (/dragon|giant|tarrasque|kraken|beholder/.test(name))
    aggression = 9;
  if (/goblin|kobold|rat/.test(name))
    aggression = 3;
  if (/orc|gnoll|bugbear|troll/.test(name))
    aggression = 7;
  if (/sprite|pixie|pegasus|unicorn/.test(name))
    aggression = 2;
  if (category === "aberration")
    aggression = 7;
  let preferredTerrain = ["forest", "hills"];
  if (/ice|frost|snow|white-dragon|winter|mammoth|woolly|polar/.test(name))
    preferredTerrain = ["mountains"];
  if (/fire|magma|flame|red-dragon|salamander|azer|efreeti/.test(name))
    preferredTerrain = ["mountains", "desert"];
  if (/swamp|marsh|black-dragon|toad|frog|crocodile|lizard|bullywug|hag/.test(name))
    preferredTerrain = ["swamp"];
  if (/desert|sand|blue-dragon|scorpion|asp|cobra/.test(name))
    preferredTerrain = ["desert"];
  if (/forest|wood|green|treant|dryad|owl|hawk|boar|elk/.test(name))
    preferredTerrain = ["forest"];
  if (/mountain|stone|hill|cliff|cave|giant|dwarf|rock/.test(name))
    preferredTerrain = ["mountains", "hills"];
  if (/road|bandit|brigand/.test(name))
    preferredTerrain = ["road", "clear"];
  if (/underground|cave|deep|drow|duergar|hook|umber|mind-flayer|aboleth|purple-worm/.test(name))
    preferredTerrain = ["mountains", "hills"];
  if (/sea|ocean|aquatic|fish|shark|kraken|merfolk|triton|sahuagin|crab|octopus|eel|squid|whale|dolphin|sea-serpent|dragon-turtle|morkoth|laceddon|nixie|nereid|water-elemental|kelpie|sea-hag|sea-giant|giant-shark|giant-crab|giant-octopus/.test(name)) {
    preferredTerrain = ["coastal", "ocean", "reef"];
    category = "aquatic";
  }
  if (/river|pike|otter|beaver|crocodile|hippopotamus|nixie/.test(name))
    preferredTerrain = ["river", "swamp", "coastal"];
  let breedingSeason = [3, 4, 5];
  if (category === "undead" || category === "construct" || category === "elemental")
    breedingSeason = [];
  if (/rat|ant|beetle|roach/.test(name))
    breedingSeason = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  if (/frost|ice|winter|white/.test(name))
    breedingSeason = [1, 2];
  if (/fire|flame|summer/.test(name))
    breedingSeason = [6, 7, 8];
  let migratory = false;
  let migrationMonths;
  if (/orc|gnoll|wolf|dire-wolf|wyvern|harpy|bird|eagle|hawk/.test(name)) {
    migratory = true;
    migrationMonths = [10, 11];
  }
  let foodChain = 5;
  if (/tarrasque|kraken|leviathan|elder-brain|titan/.test(name))
    foodChain = 10;
  if (/dragon|beholder|mind-flayer|aboleth|giant|lich|nightwalker/.test(name))
    foodChain = 9;
  if (/troll|ogre|wyvern|hydra|manticore|chimera/.test(name))
    foodChain = 8;
  if (/orc|gnoll|bugbear|dire/.test(name))
    foodChain = 6;
  if (/goblin|kobold|skeleton|zombie/.test(name))
    foodChain = 3;
  if (/rat|ant|beetle/.test(name))
    foodChain = 2;
  let socialStructure = "pack";
  if (/horde|swarm|zombie|skeleton|rat|ant|beetle/.test(name))
    socialStructure = "horde";
  if (/dragon|lich|beholder|medusa|sphinx|titan|tarrasque/.test(name))
    socialStructure = "solitary";
  if (/ant|bee|wasp|spider|kobold/.test(name))
    socialStructure = "hive";
  if (/orc|goblin|hobgoblin|gnoll|lizardfolk|merfolk|drow|yuan-ti/.test(name))
    socialStructure = "tribe";
  return {
    category,
    basePop,
    growthRate,
    aggression,
    preferredTerrain,
    breedingSeason,
    migratory,
    migrationMonths,
    foodChain,
    socialStructure
  };
}
function getSpeciesConfig(species) {
  if (SPECIES_CONFIG[species]) {
    return SPECIES_CONFIG[species];
  }
  return inferSpeciesConfig(species);
}
var SPECIES_CONFIG = {
  orc: {
    category: "humanoid",
    basePop: { min: 20, max: 80 },
    growthRate: 0.04,
    aggression: 7,
    preferredTerrain: ["hills", "mountains", "forest"],
    breedingSeason: [3, 4, 5],
    migratory: true,
    migrationMonths: [10, 11],
    foodChain: 6,
    socialStructure: "tribe"
  },
  goblin: {
    category: "humanoid",
    basePop: { min: 30, max: 100 },
    growthRate: 0.06,
    aggression: 4,
    preferredTerrain: ["forest", "hills", "swamp"],
    breedingSeason: [2, 3, 4, 5, 6],
    migratory: false,
    foodChain: 3,
    socialStructure: "horde"
  },
  kobold: {
    category: "humanoid",
    basePop: { min: 40, max: 150 },
    growthRate: 0.08,
    aggression: 3,
    preferredTerrain: ["hills", "mountains"],
    breedingSeason: [1, 2, 3, 4, 5, 6],
    migratory: false,
    foodChain: 2,
    socialStructure: "hive"
  },
  gnoll: {
    category: "humanoid",
    basePop: { min: 15, max: 50 },
    growthRate: 0.03,
    aggression: 8,
    preferredTerrain: ["desert", "clear"],
    breedingSeason: [4, 5],
    migratory: true,
    migrationMonths: [11, 12, 1],
    foodChain: 7,
    socialStructure: "pack"
  },
  hobgoblin: {
    category: "humanoid",
    basePop: { min: 15, max: 60 },
    growthRate: 0.03,
    aggression: 6,
    preferredTerrain: ["hills", "forest"],
    breedingSeason: [3, 4, 5],
    migratory: false,
    foodChain: 6,
    socialStructure: "tribe"
  },
  bugbear: {
    category: "humanoid",
    basePop: { min: 5, max: 20 },
    growthRate: 0.02,
    aggression: 7,
    preferredTerrain: ["forest", "hills"],
    breedingSeason: [4, 5],
    migratory: false,
    foodChain: 6,
    socialStructure: "pack"
  },
  lizardfolk: {
    category: "humanoid",
    basePop: { min: 20, max: 70 },
    growthRate: 0.03,
    aggression: 5,
    preferredTerrain: ["swamp"],
    breedingSeason: [5, 6, 7],
    migratory: false,
    foodChain: 5,
    socialStructure: "tribe"
  },
  skeleton: {
    category: "undead",
    basePop: { min: 10, max: 50 },
    growthRate: 0,
    aggression: 8,
    preferredTerrain: ["swamp", "mountains", "hills"],
    breedingSeason: [],
    migratory: false,
    foodChain: 4,
    socialStructure: "horde"
  },
  zombie: {
    category: "undead",
    basePop: { min: 5, max: 30 },
    growthRate: 0,
    aggression: 9,
    preferredTerrain: ["swamp", "forest"],
    breedingSeason: [],
    migratory: false,
    foodChain: 3,
    socialStructure: "horde"
  },
  ghoul: {
    category: "undead",
    basePop: { min: 3, max: 15 },
    growthRate: 0.01,
    aggression: 9,
    preferredTerrain: ["swamp", "forest"],
    breedingSeason: [],
    migratory: false,
    foodChain: 5,
    socialStructure: "pack"
  },
  wight: {
    category: "undead",
    basePop: { min: 1, max: 5 },
    growthRate: 0,
    aggression: 8,
    preferredTerrain: ["mountains", "hills"],
    breedingSeason: [],
    migratory: false,
    foodChain: 7,
    socialStructure: "solitary"
  },
  wraith: {
    category: "undead",
    basePop: { min: 1, max: 3 },
    growthRate: 0,
    aggression: 9,
    preferredTerrain: ["mountains", "swamp"],
    breedingSeason: [],
    migratory: false,
    foodChain: 8,
    socialStructure: "solitary"
  },
  "vampire-spawn": {
    category: "undead",
    basePop: { min: 1, max: 5 },
    growthRate: 0.005,
    aggression: 7,
    preferredTerrain: ["forest", "hills"],
    breedingSeason: [],
    migratory: false,
    foodChain: 8,
    socialStructure: "pack"
  },
  wolf: {
    category: "beast",
    basePop: { min: 5, max: 20 },
    growthRate: 0.04,
    aggression: 5,
    preferredTerrain: ["forest", "hills", "clear"],
    breedingSeason: [2, 3],
    migratory: true,
    migrationMonths: [11, 12],
    foodChain: 5,
    socialStructure: "pack"
  },
  "dire-wolf": {
    category: "beast",
    basePop: { min: 3, max: 12 },
    growthRate: 0.03,
    aggression: 7,
    preferredTerrain: ["forest", "mountains"],
    breedingSeason: [2, 3],
    migratory: true,
    migrationMonths: [11, 12],
    foodChain: 7,
    socialStructure: "pack"
  },
  bear: {
    category: "beast",
    basePop: { min: 2, max: 8 },
    growthRate: 0.02,
    aggression: 4,
    preferredTerrain: ["forest", "mountains"],
    breedingSeason: [5, 6],
    migratory: false,
    foodChain: 7,
    socialStructure: "solitary"
  },
  "giant-spider": {
    category: "beast",
    basePop: { min: 10, max: 40 },
    growthRate: 0.05,
    aggression: 6,
    preferredTerrain: ["forest", "swamp"],
    breedingSeason: [4, 5, 6],
    migratory: false,
    foodChain: 5,
    socialStructure: "hive"
  },
  "giant-rat": {
    category: "beast",
    basePop: { min: 20, max: 100 },
    growthRate: 0.1,
    aggression: 3,
    preferredTerrain: ["swamp", "forest"],
    breedingSeason: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    migratory: false,
    foodChain: 2,
    socialStructure: "horde"
  },
  worg: {
    category: "beast",
    basePop: { min: 5, max: 15 },
    growthRate: 0.03,
    aggression: 7,
    preferredTerrain: ["forest", "hills"],
    breedingSeason: [3, 4],
    migratory: false,
    foodChain: 6,
    socialStructure: "pack"
  },
  "young-dragon": {
    category: "dragon",
    basePop: { min: 1, max: 1 },
    growthRate: 0,
    aggression: 8,
    preferredTerrain: ["mountains", "hills"],
    breedingSeason: [],
    migratory: false,
    foodChain: 10,
    socialStructure: "solitary"
  },
  drake: {
    category: "dragon",
    basePop: { min: 1, max: 3 },
    growthRate: 0.01,
    aggression: 7,
    preferredTerrain: ["mountains", "desert"],
    breedingSeason: [6, 7],
    migratory: false,
    foodChain: 8,
    socialStructure: "solitary"
  },
  wyvern: {
    category: "dragon",
    basePop: { min: 1, max: 4 },
    growthRate: 0.01,
    aggression: 8,
    preferredTerrain: ["mountains", "hills"],
    breedingSeason: [5, 6],
    migratory: true,
    migrationMonths: [10, 11],
    foodChain: 8,
    socialStructure: "solitary"
  },
  ogre: {
    category: "giant",
    basePop: { min: 2, max: 8 },
    growthRate: 0.02,
    aggression: 7,
    preferredTerrain: ["hills", "forest", "mountains"],
    breedingSeason: [4, 5],
    migratory: false,
    foodChain: 7,
    socialStructure: "pack"
  },
  troll: {
    category: "giant",
    basePop: { min: 1, max: 4 },
    growthRate: 0.015,
    aggression: 8,
    preferredTerrain: ["swamp", "forest"],
    breedingSeason: [3, 4],
    migratory: false,
    foodChain: 8,
    socialStructure: "solitary"
  },
  "hill-giant": {
    category: "giant",
    basePop: { min: 1, max: 3 },
    growthRate: 0.01,
    aggression: 6,
    preferredTerrain: ["hills"],
    breedingSeason: [5, 6],
    migratory: false,
    foodChain: 8,
    socialStructure: "pack"
  },
  "frost-giant": {
    category: "giant",
    basePop: { min: 1, max: 2 },
    growthRate: 0.005,
    aggression: 7,
    preferredTerrain: ["mountains"],
    breedingSeason: [1, 2],
    migratory: false,
    foodChain: 9,
    socialStructure: "tribe"
  },
  "fire-giant": {
    category: "giant",
    basePop: { min: 1, max: 2 },
    growthRate: 0.005,
    aggression: 8,
    preferredTerrain: ["mountains"],
    breedingSeason: [7, 8],
    migratory: false,
    foodChain: 9,
    socialStructure: "tribe"
  },
  harpy: {
    category: "beast",
    basePop: { min: 3, max: 12 },
    growthRate: 0.03,
    aggression: 6,
    preferredTerrain: ["mountains", "hills"],
    breedingSeason: [4, 5],
    migratory: true,
    migrationMonths: [10, 11],
    foodChain: 5,
    socialStructure: "pack"
  },
  manticore: {
    category: "beast",
    basePop: { min: 1, max: 2 },
    growthRate: 0.01,
    aggression: 9,
    preferredTerrain: ["mountains", "desert"],
    breedingSeason: [6],
    migratory: false,
    foodChain: 8,
    socialStructure: "solitary"
  },
  griffon: {
    category: "beast",
    basePop: { min: 2, max: 6 },
    growthRate: 0.02,
    aggression: 5,
    preferredTerrain: ["mountains", "hills"],
    breedingSeason: [4, 5],
    migratory: false,
    foodChain: 7,
    socialStructure: "pack"
  },
  basilisk: {
    category: "beast",
    basePop: { min: 1, max: 2 },
    growthRate: 0.005,
    aggression: 7,
    preferredTerrain: ["desert", "hills"],
    breedingSeason: [7, 8],
    migratory: false,
    foodChain: 7,
    socialStructure: "solitary"
  },
  medusa: {
    category: "aberration",
    basePop: { min: 1, max: 1 },
    growthRate: 0,
    aggression: 6,
    preferredTerrain: ["mountains", "hills"],
    breedingSeason: [],
    migratory: false,
    foodChain: 7,
    socialStructure: "solitary"
  },
  minotaur: {
    category: "beast",
    basePop: { min: 1, max: 3 },
    growthRate: 0.01,
    aggression: 8,
    preferredTerrain: ["hills", "mountains"],
    breedingSeason: [5, 6],
    migratory: false,
    foodChain: 7,
    socialStructure: "solitary"
  }
};
function generatePopulation(rng, species, hexCoord, terrain, worldTime) {
  const config2 = getSpeciesConfig(species);
  const basePop = config2.basePop.min + rng.int(config2.basePop.max - config2.basePop.min);
  return {
    id: `pop-${species}-${Date.now()}-${rng.int(1e4)}`,
    species,
    category: config2.category,
    hexCoord,
    territoryName: `hex:${hexCoord.q},${hexCoord.r}`,
    preferredTerrain: config2.preferredTerrain,
    population: basePop,
    maxPopulation: Math.floor(basePop * (1.5 + rng.next())),
    growthRate: config2.growthRate,
    aggression: config2.aggression + rng.int(3) - 1,
    territorialRadius: config2.socialStructure === "solitary" ? 1 : config2.socialStructure === "pack" ? 2 : 3,
    nomadic: config2.migratory,
    breedingSeason: config2.breedingSeason,
    migrationSeason: config2.migrationMonths,
    lastBreeding: worldTime,
    recentLosses: 0,
    recentHunting: 0,
    morale: 0,
    roomsClaimed: 0
  };
}
function tickBreeding(rng, ecology, world, worldTime) {
  const logs = [];
  const currentMonth = worldTime.getUTCMonth() + 1;
  for (const pop of ecology.populations) {
    if (pop.population <= 0)
      continue;
    if (!pop.breedingSeason.includes(currentMonth))
      continue;
    const lastBreedMonth = new Date(pop.lastBreeding).getUTCMonth() + 1;
    const lastBreedYear = new Date(pop.lastBreeding).getUTCFullYear();
    if (lastBreedMonth === currentMonth && lastBreedYear === worldTime.getUTCFullYear())
      continue;
    let growth = pop.growthRate;
    if (pop.morale > 0)
      growth += pop.morale / 100;
    if (pop.recentLosses > pop.population * 0.2)
      growth -= 0.02;
    if (pop.population >= pop.maxPopulation * 0.9)
      growth *= 0.5;
    const predators = ecology.populations.filter((p) => p.id !== pop.id && getSpeciesConfig(p.species).foodChain > getSpeciesConfig(pop.species).foodChain && hexDistance2(p.hexCoord, pop.hexCoord) <= 2);
    if (predators.length > 0)
      growth *= 0.7;
    const offspring = Math.max(0, Math.floor(pop.population * growth));
    if (offspring > 0) {
      pop.population = Math.min(pop.maxPopulation, pop.population + offspring);
      pop.lastBreeding = worldTime;
      if (offspring >= 5 || pop.species === "young-dragon") {
        const config2 = getSpeciesConfig(pop.species);
        logs.push({
          category: "road",
          summary: `${pop.species} population swells near ${pop.territoryName}`,
          details: `${offspring} new ${pop.species}s emerge. The ${config2.socialStructure} grows stronger. Travelers beware.`,
          location: pop.territoryName,
          worldTime,
          realTime: new Date,
          seed: world.seed
        });
      }
    }
  }
  return logs;
}
function tickMigration(rng, ecology, world, worldTime) {
  const logs = [];
  const currentMonth = worldTime.getUTCMonth() + 1;
  for (const migration of ecology.migrations) {
    if (new Date(migration.arrivesAt) <= worldTime) {
      const pop = ecology.populations.find((p) => p.id === migration.populationId);
      if (pop) {
        pop.hexCoord = migration.toHex;
        pop.territoryName = `hex:${migration.toHex.q},${migration.toHex.r}`;
        pop.lastMigration = worldTime;
        const nearestSettlement = findNearestSettlement(migration.toHex, world);
        logs.push({
          category: "road",
          summary: `${pop.species} arrive in new territory`,
          details: `A ${getSpeciesConfig(pop.species).socialStructure} of ${pop.population} ${pop.species}s completes their migration. ${nearestSettlement ? `The people of ${nearestSettlement.name} grow uneasy.` : ""}`,
          location: pop.territoryName,
          worldTime,
          realTime: new Date,
          seed: world.seed
        });
        if (nearestSettlement) {
          const sState = getSettlementState(world, nearestSettlement.name);
          sState.safety = Math.max(-10, sState.safety - 2);
          nearestSettlement.mood = Math.max(-5, nearestSettlement.mood - 1);
        }
      }
    }
  }
  ecology.migrations = ecology.migrations.filter((m) => new Date(m.arrivesAt) > worldTime);
  for (const pop of ecology.populations) {
    if (!pop.nomadic || pop.population <= 0)
      continue;
    if (!pop.migrationSeason?.includes(currentMonth))
      continue;
    if (ecology.migrations.some((m) => m.populationId === pop.id))
      continue;
    if (pop.lastMigration) {
      const monthsSinceMigration = (worldTime.getTime() - new Date(pop.lastMigration).getTime()) / (30 * 24 * 60 * 60 * 1000);
      if (monthsSinceMigration < 6)
        continue;
    }
    let shouldMigrate = false;
    let reason = "";
    if (currentMonth >= 10 || currentMonth <= 2) {
      shouldMigrate = true;
      reason = "seeking warmer territories for winter";
    }
    if (pop.population >= pop.maxPopulation * 0.9) {
      shouldMigrate = true;
      reason = "seeking new hunting grounds";
    }
    const threats = ecology.populations.filter((p) => p.id !== pop.id && getSpeciesConfig(p.species).foodChain > getSpeciesConfig(pop.species).foodChain + 2 && hexDistance2(p.hexCoord, pop.hexCoord) <= 2);
    if (threats.length > 0) {
      shouldMigrate = true;
      reason = `fleeing from ${threats[0].species}`;
    }
    if (shouldMigrate && rng.chance(0.3)) {
      const destQ = pop.hexCoord.q + rng.int(7) - 3;
      const destR = pop.hexCoord.r + rng.int(7) - 3;
      const destination = {
        q: Math.max(0, Math.min(world.width - 1, destQ)),
        r: Math.max(0, Math.min(world.height - 1, destR))
      };
      if (destination.q === pop.hexCoord.q && destination.r === pop.hexCoord.r)
        continue;
      const migrationHours = 168 + rng.int(504);
      ecology.migrations.push({
        populationId: pop.id,
        fromHex: { ...pop.hexCoord },
        toHex: destination,
        startedAt: worldTime,
        arrivesAt: new Date(worldTime.getTime() + migrationHours * 60 * 60 * 1000),
        reason
      });
      const daysApprox = Math.round(migrationHours / 24);
      logs.push({
        category: "road",
        summary: `${pop.species} begin migration`,
        details: `A ${getSpeciesConfig(pop.species).socialStructure} of ${pop.population} ${pop.species}s departs, ${reason}. They will travel for approximately ${daysApprox} days.`,
        location: pop.territoryName,
        worldTime,
        realTime: new Date,
        seed: world.seed
      });
    }
  }
  return logs;
}
function tickApexPredators(rng, ecology, world, antagonists, worldTime) {
  const logs = [];
  const apexPredators = ecology.populations.filter((p) => getSpeciesConfig(p.species).foodChain >= 8 && p.population > 0);
  for (const apex of apexPredators) {
    const prey = ecology.populations.filter((p) => p.id !== apex.id && getSpeciesConfig(p.species).foodChain < getSpeciesConfig(apex.species).foodChain - 1 && hexDistance2(p.hexCoord, apex.hexCoord) <= apex.territorialRadius && p.population > 0);
    if (prey.length > 0 && rng.chance(0.1)) {
      const target = rng.pick(prey);
      const kills = Math.min(target.population, 1 + rng.int(Math.ceil(apex.population / 2)));
      target.population -= kills;
      target.recentLosses += kills;
      target.morale = Math.max(-10, target.morale - 2);
      apex.recentHunting += kills;
      apex.morale = Math.min(10, apex.morale + 1);
      if (kills >= 5) {
        logs.push({
          category: "road",
          summary: `${apex.species} hunts ${target.species}`,
          details: `The ${apex.species} of ${apex.territoryName} feast on ${kills} ${target.species}s. The balance of power is maintained.`,
          location: apex.territoryName,
          worldTime,
          realTime: new Date,
          seed: world.seed
        });
      }
    }
    const nearbyAntagonist = antagonists.find((a) => a.alive && a.type === "dragon" && a.territory === findNearestSettlement(apex.hexCoord, world)?.name);
    if (nearbyAntagonist && !apex.leaderId && apex.species.includes("dragon")) {
      apex.leaderId = nearbyAntagonist.id;
    }
  }
  return logs;
}
function tickTerritorialDisputes(rng, ecology, world, worldTime) {
  const logs = [];
  for (let i = 0;i < ecology.populations.length; i++) {
    const pop1 = ecology.populations[i];
    if (pop1.population <= 0)
      continue;
    for (let j = i + 1;j < ecology.populations.length; j++) {
      const pop2 = ecology.populations[j];
      if (pop2.population <= 0)
        continue;
      if (pop1.species === pop2.species)
        continue;
      const distance = hexDistance2(pop1.hexCoord, pop2.hexCoord);
      const overlap = Math.max(pop1.territorialRadius, pop2.territorialRadius) - distance;
      if (overlap <= 0)
        continue;
      if (pop1.tributeTo === pop2.id || pop2.tributeTo === pop1.id)
        continue;
      const existingDispute = ecology.territorialDisputes.find((d) => d.population1Id === pop1.id && d.population2Id === pop2.id || d.population1Id === pop2.id && d.population2Id === pop1.id);
      if (existingDispute) {
        if (rng.chance(0.2)) {
          existingDispute.intensity++;
          if (existingDispute.intensity >= 5) {
            const pop1Strength = pop1.population * (getSpeciesConfig(pop1.species).foodChain + pop1.morale);
            const pop2Strength = pop2.population * (getSpeciesConfig(pop2.species).foodChain + pop2.morale);
            const pop1Wins = pop1Strength + rng.int(50) > pop2Strength + rng.int(50);
            const winner = pop1Wins ? pop1 : pop2;
            const loser = pop1Wins ? pop2 : pop1;
            const loserLosses = Math.floor(loser.population * (0.2 + rng.next() * 0.3));
            const winnerLosses = Math.floor(winner.population * (0.05 + rng.next() * 0.15));
            loser.population -= loserLosses;
            loser.recentLosses += loserLosses;
            loser.morale -= 3;
            winner.population -= winnerLosses;
            winner.recentLosses += winnerLosses;
            winner.morale += 2;
            logs.push({
              category: "road",
              summary: `${pop1.species} and ${pop2.species} clash`,
              details: `Territorial war erupts! The ${winner.species} triumph, but ${winnerLosses} fall. The ${loser.species} lose ${loserLosses} and retreat.`,
              location: `hex:${existingDispute.contestedHex.q},${existingDispute.contestedHex.r}`,
              worldTime,
              realTime: new Date,
              seed: world.seed
            });
            if (loser.population < winner.population * 0.5 && rng.chance(0.4)) {
              loser.tributeTo = winner.id;
              logs.push({
                category: "road",
                summary: `${loser.species} submit to ${winner.species}`,
                details: `The beaten ${loser.species} now serve their conquerors.`,
                location: loser.territoryName,
                worldTime,
                realTime: new Date,
                seed: world.seed
              });
            }
            ecology.territorialDisputes = ecology.territorialDisputes.filter((d) => d.id !== existingDispute.id);
          }
        }
      } else if (rng.chance(0.05)) {
        ecology.territorialDisputes.push({
          id: `dispute-${Date.now()}`,
          population1Id: pop1.id,
          population2Id: pop2.id,
          contestedHex: pop1.hexCoord,
          startedAt: worldTime,
          intensity: 1
        });
        if (rng.chance(0.3)) {
          logs.push({
            category: "road",
            summary: `${pop1.species} and ${pop2.species} tensions rise`,
            details: `Two populations eye the same territory. Conflict seems inevitable.`,
            location: pop1.territoryName,
            worldTime,
            realTime: new Date,
            seed: world.seed
          });
        }
      }
    }
  }
  return logs;
}
function tickDungeonEcology(rng, ecology, world, worldTime) {
  const logs = [];
  for (const dungeon of world.dungeons) {
    if (!dungeon.rooms || dungeon.rooms.length === 0)
      continue;
    const emptyRooms = dungeon.rooms.filter((r) => r.type === "empty").length;
    const totalRooms = dungeon.rooms.length;
    const exploredPct = (dungeon.explored ?? 0) / totalRooms;
    let dungeonPop = ecology.populations.find((p) => p.dungeonId === dungeon.id);
    if (!dungeonPop && exploredPct > 0.5 && emptyRooms > 0) {
      if (rng.chance(0.01)) {
        const species = rng.pick(["goblin", "kobold", "orc", "skeleton", "giant-spider", "giant-rat"]);
        const newPop = generatePopulation(rng, species, dungeon.coord, "hills", worldTime);
        newPop.dungeonId = dungeon.id;
        newPop.territoryName = dungeon.name;
        newPop.roomsClaimed = 1;
        ecology.populations.push(newPop);
        logs.push({
          category: "dungeon",
          summary: `${species} move into ${dungeon.name}`,
          details: `The empty halls of ${dungeon.name} attract new inhabitants. The ${species} begin to claim the depths.`,
          location: dungeon.name,
          worldTime,
          realTime: new Date,
          seed: world.seed
        });
      }
    } else if (dungeonPop && dungeonPop.population > 0) {
      if (dungeonPop.roomsClaimed < emptyRooms && rng.chance(0.006)) {
        dungeonPop.roomsClaimed++;
        const emptyRoom = dungeon.rooms.find((r) => r.type === "empty");
        if (emptyRoom) {
          emptyRoom.type = "lair";
        }
        if (rng.chance(0.3)) {
          logs.push({
            category: "dungeon",
            summary: `${dungeonPop.species} spread deeper into ${dungeon.name}`,
            details: `Another chamber falls under their control. The dungeon grows more dangerous.`,
            location: dungeon.name,
            worldTime,
            realTime: new Date,
            seed: world.seed
          });
        }
      }
    }
  }
  return logs;
}
function tickMonsterAlliances(rng, ecology, world, antagonists, worldTime) {
  const logs = [];
  for (const antagonist of antagonists) {
    if (!antagonist.alive)
      continue;
    if (!["orc-warlord", "dark-wizard", "necromancer", "dragon", "demon-bound"].includes(antagonist.type))
      continue;
    const nearbyPops = ecology.populations.filter((p) => {
      if (p.population <= 0 || p.leaderId)
        return false;
      const nearestSettlement = findNearestSettlement(p.hexCoord, world);
      if (nearestSettlement?.name !== antagonist.territory)
        return false;
      if (antagonist.type === "orc-warlord" && !["orc", "goblin", "hobgoblin", "worg"].includes(p.species))
        return false;
      if (antagonist.type === "necromancer" && p.category !== "undead")
        return false;
      if (antagonist.type === "dragon" && !["kobold", "drake", "wyvern"].includes(p.species))
        return false;
      return true;
    });
    for (const pop of nearbyPops) {
      if (rng.chance(0.02)) {
        pop.leaderId = antagonist.id;
        logs.push({
          category: "faction",
          summary: `${pop.species} rally to ${antagonist.name}`,
          details: `The ${pop.species} of ${pop.territoryName} swear allegiance to ${antagonist.name} ${antagonist.epithet}. Their numbers swell the villain's forces.`,
          location: antagonist.territory,
          actors: [antagonist.name],
          worldTime,
          realTime: new Date,
          seed: world.seed
        });
        antagonist.followers = (antagonist.followers ?? 0) + pop.population;
      }
    }
  }
  return logs;
}
function tickPopulationHealth(rng, ecology, world, worldTime) {
  const logs = [];
  for (const pop of ecology.populations) {
    if (pop.recentLosses > pop.population * 0.3) {
      pop.morale = Math.max(-10, pop.morale - 2);
    }
    if (pop.category !== "undead" && pop.category !== "construct") {
      if (pop.recentHunting < pop.population * 0.1 && rng.chance(0.1)) {
        const starvation = Math.floor(pop.population * 0.05);
        pop.population -= starvation;
        pop.morale -= 1;
      }
    }
    if (worldTime.getUTCDate() === 1) {
      pop.recentLosses = 0;
      pop.recentHunting = 0;
    }
    if (pop.population <= 0) {
      ecology.extinctions.push({
        species: pop.species,
        location: pop.territoryName,
        timestamp: worldTime,
        cause: pop.recentLosses > 0 ? "combat losses" : "starvation or disease"
      });
      logs.push({
        category: "road",
        summary: `${pop.species} wiped out in ${pop.territoryName}`,
        details: `The last of the ${pop.species} have fallen. The region grows quieter—for now.`,
        location: pop.territoryName,
        worldTime,
        realTime: new Date,
        seed: world.seed
      });
    }
  }
  ecology.populations = ecology.populations.filter((p) => p.population > 0);
  return logs;
}
function hexDistance2(a, b) {
  return (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
}
function findNearestSettlement(hex, world) {
  let nearest;
  let nearestDist = Infinity;
  for (const settlement of world.settlements) {
    const dist = hexDistance2(hex, settlement.coord);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearest = settlement;
    }
  }
  return nearest;
}
function tickEcology(rng, ecology, world, antagonists, worldTime) {
  const logs = [];
  logs.push(...tickBreeding(rng, ecology, world, worldTime));
  logs.push(...tickMigration(rng, ecology, world, worldTime));
  logs.push(...tickApexPredators(rng, ecology, world, antagonists, worldTime));
  logs.push(...tickTerritorialDisputes(rng, ecology, world, worldTime));
  logs.push(...tickDungeonEcology(rng, ecology, world, worldTime));
  logs.push(...tickMonsterAlliances(rng, ecology, world, antagonists, worldTime));
  logs.push(...tickPopulationHealth(rng, ecology, world, worldTime));
  return logs;
}
function createEcologyState() {
  return {
    populations: [],
    extinctions: [],
    migrations: [],
    territorialDisputes: []
  };
}
function seedEcology(rng, world, worldTime) {
  const ecology = createEcologyState();
  for (const hex of world.hexes) {
    const hasSettlement = world.settlements.some((s) => s.coord.q === hex.coord.q && s.coord.r === hex.coord.r);
    if (hasSettlement)
      continue;
    const suitableSpecies = ALL_SPECIES.filter((species) => getSpeciesConfig(species).preferredTerrain.includes(hex.terrain));
    if (suitableSpecies.length === 0)
      continue;
    if (rng.chance(0.3)) {
      const species = rng.pick(suitableSpecies);
      const pop = generatePopulation(rng, species, hex.coord, hex.terrain, worldTime);
      ecology.populations.push(pop);
    }
    if (rng.chance(0.1)) {
      const species = rng.pick(suitableSpecies);
      const pop = generatePopulation(rng, species, hex.coord, hex.terrain, worldTime);
      pop.population = Math.floor(pop.population * 0.5);
      ecology.populations.push(pop);
    }
  }
  for (const dungeon of world.dungeons) {
    const species = rng.pick(["goblin", "orc", "skeleton", "kobold", "giant-rat"]);
    const pop = generatePopulation(rng, species, dungeon.coord, "hills", worldTime);
    pop.dungeonId = dungeon.id;
    pop.territoryName = dungeon.name;
    pop.roomsClaimed = Math.min(dungeon.rooms?.length ?? 1, 3 + rng.int(5));
    ecology.populations.push(pop);
  }
  return ecology;
}

// src/dynasty.ts
var FAMILY_NAMES = [
  "Blackwood",
  "Ironheart",
  "Stormborn",
  "Goldmane",
  "Ravencrest",
  "Whitehall",
  "Thornwood",
  "Dragonbane",
  "Oakheart",
  "Silverton",
  "Darkwater",
  "Brightblade",
  "Wolfsbane",
  "Firestone",
  "Shadowmere",
  "Stonefist",
  "Greycloak",
  "Redmoor",
  "Winterfell",
  "Sunspear",
  "Highborn",
  "Coldbrook",
  "Swiftwind",
  "Nightshade",
  "Crowley"
];
var FAMILY_MOTTOS = [
  "Honor Above All",
  "We Do Not Forget",
  "Strength Through Unity",
  "From Darkness, Light",
  "The Storm Comes",
  "Unbowed, Unbroken",
  "Steel and Faith",
  "Blood and Gold",
  "First in Battle",
  "Our Word is Law",
  "We Rise Again",
  "The Night Remembers",
  "Fortune Favors the Bold",
  "Loyalty Unto Death",
  "Fire and Fury"
];
var LIFESPAN_BY_CLASS = {
  Fighter: { adolescence: 14, adulthood: 18, elderlyStart: 55, maxAge: 75, healthDeclineRate: 0.05 },
  Cleric: { adolescence: 14, adulthood: 18, elderlyStart: 60, maxAge: 80, healthDeclineRate: 0.04 },
  "Magic-User": { adolescence: 14, adulthood: 18, elderlyStart: 65, maxAge: 90, healthDeclineRate: 0.03 },
  Thief: { adolescence: 14, adulthood: 18, elderlyStart: 50, maxAge: 70, healthDeclineRate: 0.06 },
  Dwarf: { adolescence: 30, adulthood: 40, elderlyStart: 200, maxAge: 350, healthDeclineRate: 0.01 },
  Elf: { adolescence: 50, adulthood: 100, elderlyStart: 500, maxAge: 1000, healthDeclineRate: 0.005 },
  Halfling: { adolescence: 20, adulthood: 30, elderlyStart: 80, maxAge: 120, healthDeclineRate: 0.03 },
  Druid: { adolescence: 14, adulthood: 18, elderlyStart: 70, maxAge: 100, healthDeclineRate: 0.03 },
  Mystic: { adolescence: 14, adulthood: 18, elderlyStart: 80, maxAge: 120, healthDeclineRate: 0.02 }
};
function generateBloodline(rng, founderId, founderName, seat) {
  const familyName = rng.pick(FAMILY_NAMES);
  return {
    id: `bloodline-${Date.now()}-${rng.int(1e4)}`,
    name: familyName,
    motto: rng.chance(0.7) ? rng.pick(FAMILY_MOTTOS) : undefined,
    founderId,
    currentHeadId: founderId,
    seat,
    reputation: rng.int(11) - 5,
    wealth: 100 + rng.int(400),
    members: [founderId],
    deceasedMembers: [],
    alliances: [],
    enemies: [],
    traits: [rng.pick(["ambitious", "honorable", "cunning", "brave", "cruel", "charitable"])]
  };
}
function calculateAge(birthDate, currentDate) {
  const diff = currentDate.getTime() - new Date(birthDate).getTime();
  return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
}
function tickAging(rng, dynasty, world, worldTime) {
  const logs = [];
  for (const npc of world.npcs) {
    if (npc.alive === false || !npc.birthDate)
      continue;
    const age = calculateAge(npc.birthDate, worldTime);
    const charClass = npc.class ?? "Fighter";
    const lifespan = LIFESPAN_BY_CLASS[charClass];
    if (age >= lifespan.elderlyStart) {
      const lastCheck = npc.lastHealthCheck ? new Date(npc.lastHealthCheck) : new Date(0);
      const daysSinceCheck = (worldTime.getTime() - lastCheck.getTime()) / (24 * 60 * 60 * 1000);
      if (daysSinceCheck >= 1) {
        npc.lastHealthCheck = worldTime;
        const yearsOld = age - lifespan.elderlyStart;
        const declineChance = yearsOld * lifespan.healthDeclineRate;
        if (rng.chance(declineChance)) {
          if (npc.healthCondition === "healthy") {
            npc.healthCondition = "frail";
            if (npc.fame && npc.fame >= 3) {
              logs.push({
                category: "town",
                summary: `${npc.name} grows frail with age`,
                details: `The years weigh heavy on the ${npc.role}. Their step slows, their grip weakens.`,
                location: npc.location,
                actors: [npc.name],
                worldTime,
                realTime: new Date,
                seed: world.seed
              });
            }
          } else if (npc.healthCondition === "frail") {
            npc.healthCondition = "ill";
            logs.push({
              category: "town",
              summary: `${npc.name} falls ill`,
              details: `The ${npc.role} takes to their bed. Healers are summoned.`,
              location: npc.location,
              actors: [npc.name],
              worldTime,
              realTime: new Date,
              seed: world.seed
            });
          } else if (npc.healthCondition === "ill") {
            npc.healthCondition = "dying";
            logs.push({
              category: "town",
              summary: `${npc.name} is dying`,
              details: `The end approaches for the ${npc.role}. Family and rivals alike watch and wait.`,
              location: npc.location,
              actors: [npc.name],
              worldTime,
              realTime: new Date,
              seed: world.seed
            });
          } else if (npc.healthCondition === "dying") {
            logs.push(...processNaturalDeath(rng, npc, "old age", dynasty, world, worldTime));
          }
        }
        if (age >= lifespan.maxAge - 10) {
          const deathChance = (age - (lifespan.maxAge - 10)) * 0.02;
          if (rng.chance(deathChance)) {
            logs.push(...processNaturalDeath(rng, npc, "old age", dynasty, world, worldTime));
          }
        }
      }
    }
  }
  return logs;
}
function processNaturalDeath(rng, npc, cause, dynasty, world, worldTime) {
  const logs = [];
  npc.alive = false;
  npc.deathDate = worldTime;
  npc.causeOfDeath = cause;
  const bloodline = dynasty.bloodlines.find((b) => b.id === npc.bloodlineId);
  dynasty.burials.push({
    npcId: npc.id,
    npcName: npc.name,
    bloodlineId: npc.bloodlineId,
    deathDate: worldTime,
    causeOfDeath: cause,
    burialLocation: npc.location,
    childrenLeft: npc.childrenIds?.length ?? 0,
    wealthInherited: bloodline?.wealth ?? 0
  });
  logs.push({
    category: "town",
    summary: `${npc.name} has died`,
    details: `The ${npc.role} passes away from ${cause}. ${bloodline ? `The House of ${bloodline.name} mourns.` : "They will be remembered."}`,
    location: npc.location,
    actors: [npc.name],
    worldTime,
    realTime: new Date,
    seed: world.seed
  });
  const settlement = world.settlements.find((s) => s.name === npc.location);
  if (settlement && bloodline) {
    settlement.mood = Math.max(-5, settlement.mood - 1);
  }
  if (npc.spouseId) {
    const spouse = world.npcs.find((n) => n.id === npc.spouseId);
    if (spouse && spouse.alive !== false) {
      spouse.widowed = true;
      spouse.spouseId = undefined;
      const marriage = dynasty.marriages.find((m) => (m.spouse1Id === npc.id || m.spouse2Id === npc.id) && !m.dissolved);
      if (marriage) {
        marriage.dissolved = true;
        marriage.dissolvedAt = worldTime;
        marriage.dissolvedReason = "death";
      }
    }
  }
  if (bloodline) {
    bloodline.members = bloodline.members.filter((m) => m !== npc.id);
    bloodline.deceasedMembers.push(npc.id);
    if (bloodline.currentHeadId === npc.id) {
      logs.push(...processSuccession(rng, npc, bloodline, dynasty, world, worldTime));
    }
  }
  const ownedStrongholds = world.strongholds.filter((s) => s.ownerId === npc.id);
  for (const stronghold of ownedStrongholds) {
    logs.push(...processStrongholdInheritance(rng, npc, stronghold, dynasty, world, worldTime));
  }
  return logs;
}
function processSuccession(rng, deceased, bloodline, dynasty, world, worldTime) {
  const logs = [];
  let heir;
  if (deceased.heir) {
    heir = world.npcs.find((n) => n.id === deceased.heir && n.alive !== false);
  }
  if (!heir && deceased.childrenIds?.length) {
    const children = deceased.childrenIds.map((id) => world.npcs.find((n) => n.id === id)).filter((c) => c && c.alive !== false && c.legitimate).sort((a, b) => new Date(a.birthDate).getTime() - new Date(b.birthDate).getTime());
    if (children.length > 0) {
      heir = children[0];
    }
  }
  if (!heir && deceased.childrenIds?.length) {
    const children = deceased.childrenIds.map((id) => world.npcs.find((n) => n.id === id)).filter((c) => c && c.alive !== false && c.acknowledged).sort((a, b) => new Date(a.birthDate).getTime() - new Date(b.birthDate).getTime());
    if (children.length > 0) {
      heir = children[0];
    }
  }
  if (!heir && deceased.spouseId) {
    heir = world.npcs.find((n) => n.id === deceased.spouseId && n.alive !== false);
  }
  if (!heir && deceased.fatherId) {
    const father = world.npcs.find((n) => n.id === deceased.fatherId);
    if (father?.childrenIds) {
      const siblings = father.childrenIds.map((id) => world.npcs.find((n) => n.id === id)).filter((s) => s && s.alive !== false && s.id !== deceased.id);
      if (siblings.length > 0) {
        heir = siblings[0];
      }
    }
  }
  if (heir) {
    bloodline.currentHeadId = heir.id;
    if (deceased.titles?.length) {
      heir.titles = [...heir.titles ?? [], ...deceased.titles];
    }
    logs.push({
      category: "faction",
      summary: `${heir.name} becomes head of House ${bloodline.name}`,
      details: `Following the death of ${deceased.name}, ${heir.name} assumes leadership of the bloodline.`,
      location: heir.location,
      actors: [heir.name, deceased.name],
      worldTime,
      realTime: new Date,
      seed: world.seed
    });
  } else {
    const crisis = {
      id: `crisis-${Date.now()}`,
      title: `Head of House ${bloodline.name}`,
      asset: bloodline.id,
      assetType: "title",
      deceasedId: deceased.id,
      claimants: [],
      startedAt: worldTime,
      resolved: false
    };
    for (const memberId of bloodline.members) {
      const member = world.npcs.find((n) => n.id === memberId);
      if (!member || member.alive === false)
        continue;
      const age = calculateAge(member.birthDate, worldTime);
      if (age < 16)
        continue;
      let claimStrength = 3;
      if (member.legitimate)
        claimStrength += 2;
      if (member.fatherId === deceased.id || member.motherId === deceased.id)
        claimStrength += 2;
      if (member.fame && member.fame >= 3)
        claimStrength += 1;
      if (member.level && member.level >= 5)
        claimStrength += 1;
      crisis.claimants.push({
        npcId: member.id,
        npcName: member.name,
        claimStrength,
        supporters: [],
        method: rng.pick(["legal", "force", "bribery"])
      });
    }
    if (crisis.claimants.length > 1) {
      dynasty.successionCrises.push(crisis);
      logs.push({
        category: "faction",
        summary: `Succession crisis in House ${bloodline.name}!`,
        details: `With no clear heir, ${crisis.claimants.length} claimants vie for leadership. The house may tear itself apart.`,
        location: bloodline.seat ?? deceased.location,
        worldTime,
        realTime: new Date,
        seed: world.seed
      });
    } else if (crisis.claimants.length === 1) {
      bloodline.currentHeadId = crisis.claimants[0].npcId;
    } else {
      logs.push({
        category: "faction",
        summary: `House ${bloodline.name} is extinct`,
        details: `With no living heirs, the ancient bloodline ends. Their seat and wealth fall to the wind.`,
        location: bloodline.seat ?? deceased.location,
        worldTime,
        realTime: new Date,
        seed: world.seed
      });
    }
  }
  return logs;
}
function processStrongholdInheritance(rng, deceased, stronghold, dynasty, world, worldTime) {
  const logs = [];
  let heir;
  if (deceased.heir) {
    heir = world.npcs.find((n) => n.id === deceased.heir && n.alive !== false);
  }
  if (!heir && deceased.childrenIds?.length) {
    const children = deceased.childrenIds.map((id) => world.npcs.find((n) => n.id === id)).filter((c) => c && c.alive !== false).sort((a, b) => {
      if (a.legitimate !== b.legitimate)
        return a.legitimate ? -1 : 1;
      return new Date(a.birthDate).getTime() - new Date(b.birthDate).getTime();
    });
    if (children.length > 0) {
      heir = children[0];
    }
  }
  if (heir) {
    stronghold.ownerId = heir.id;
    logs.push({
      category: "faction",
      summary: `${heir.name} inherits ${stronghold.name}`,
      details: `The fortress passes to a new master. ${heir.name} claims their birthright.`,
      location: stronghold.name,
      actors: [heir.name],
      worldTime,
      realTime: new Date,
      seed: world.seed
    });
  } else {
    const crisis = {
      id: `crisis-stronghold-${Date.now()}`,
      title: `Lordship of ${stronghold.name}`,
      asset: stronghold.id,
      assetType: "stronghold",
      deceasedId: deceased.id,
      claimants: [],
      startedAt: worldTime,
      resolved: false
    };
    for (const faction of world.factions) {
      const fState = getFactionState(world, faction.id);
      if (fState.power >= 40 && rng.chance(0.3)) {
        crisis.claimants.push({
          npcId: faction.id,
          npcName: faction.name,
          claimStrength: Math.floor(fState.power / 20),
          supporters: [],
          method: "force"
        });
      }
    }
    dynasty.successionCrises.push(crisis);
    logs.push({
      category: "faction",
      summary: `${stronghold.name} falls into dispute`,
      details: `With no clear heir, the fortress attracts ambitious claimants. Conflict looms.`,
      location: stronghold.name,
      worldTime,
      realTime: new Date,
      seed: world.seed
    });
  }
  return logs;
}
function tickCourtships(rng, dynasty, world, worldTime) {
  const logs = [];
  for (const courtship of dynasty.courtships) {
    if (courtship.stage === "rejected" || courtship.stage === "married")
      continue;
    const suitor = world.npcs.find((n) => n.id === courtship.suiterId);
    const target = world.npcs.find((n) => n.id === courtship.targetId);
    if (!suitor || suitor.alive === false || !target || target.alive === false) {
      courtship.stage = "rejected";
      continue;
    }
    const progressRate = courtship.obstacles.length > 0 ? 0.2 : 0.4;
    courtship.progress += progressRate;
    if (courtship.progress >= 30 && courtship.stage === "interest") {
      courtship.stage = "courting";
      logs.push({
        category: "town",
        summary: `${suitor.name} courts ${target.name}`,
        details: `Gifts are exchanged. Time is spent together. The town gossips.`,
        location: target.location,
        actors: [suitor.name, target.name],
        worldTime,
        realTime: new Date,
        seed: world.seed
      });
    }
    if (courtship.progress >= 70 && courtship.stage === "courting") {
      courtship.stage = "betrothed";
      logs.push({
        category: "town",
        summary: `${suitor.name} and ${target.name} are betrothed`,
        details: `A formal agreement is made. The wedding will follow in due time.`,
        location: target.location,
        actors: [suitor.name, target.name],
        worldTime,
        realTime: new Date,
        seed: world.seed
      });
    }
    if (courtship.progress >= 100 && courtship.stage === "betrothed") {
      courtship.stage = "married";
      logs.push(...performMarriage(rng, suitor, target, false, dynasty, world, worldTime));
    }
    if (rng.chance(0.02)) {
      if (rng.chance(0.3)) {
        const obstacles = ["a rival suitor", "family objection", "scandal", "distance"];
        courtship.obstacles.push(rng.pick(obstacles));
        courtship.progress -= 10;
      } else if (courtship.progress > 20) {
        courtship.gifts += 10 + rng.int(40);
        courtship.progress += 5;
      }
    }
  }
  return logs;
}
function performMarriage(rng, spouse1, spouse2, political, dynasty, world, worldTime) {
  const logs = [];
  spouse1.spouseId = spouse2.id;
  spouse2.spouseId = spouse1.id;
  spouse1.marriedAt = worldTime;
  spouse2.marriedAt = worldTime;
  const marriage = {
    id: `marriage-${Date.now()}`,
    spouse1Id: spouse1.id,
    spouse2Id: spouse2.id,
    marriedAt: worldTime,
    location: spouse1.location,
    political,
    children: [],
    dissolved: false
  };
  if (spouse1.bloodlineId && spouse2.bloodlineId && spouse1.bloodlineId !== spouse2.bloodlineId) {
    const bloodline1 = dynasty.bloodlines.find((b) => b.id === spouse1.bloodlineId);
    const bloodline2 = dynasty.bloodlines.find((b) => b.id === spouse2.bloodlineId);
    if (bloodline1 && bloodline2) {
      if (!bloodline1.alliances.includes(bloodline2.id)) {
        bloodline1.alliances.push(bloodline2.id);
      }
      if (!bloodline2.alliances.includes(bloodline1.id)) {
        bloodline2.alliances.push(bloodline1.id);
      }
      marriage.allianceForged = bloodline2.id;
      logs.push({
        category: "faction",
        summary: `Houses ${bloodline1.name} and ${bloodline2.name} unite`,
        details: `The marriage of ${spouse1.name} and ${spouse2.name} forges an alliance between the bloodlines.`,
        location: marriage.location,
        actors: [spouse1.name, spouse2.name],
        worldTime,
        realTime: new Date,
        seed: world.seed
      });
    }
  }
  dynasty.marriages.push(marriage);
  logs.push({
    category: "town",
    summary: `${spouse1.name} and ${spouse2.name} are wed`,
    details: political ? `A political union is sealed. The celebrations are formal and precise.` : `Love, or something like it, blooms. The celebrations continue well into the night.`,
    location: marriage.location,
    actors: [spouse1.name, spouse2.name],
    worldTime,
    realTime: new Date,
    seed: world.seed
  });
  const settlement = world.settlements.find((s) => s.name === marriage.location);
  if (settlement) {
    const bloodline1 = dynasty.bloodlines.find((b) => b.id === spouse1.bloodlineId);
    const bloodline2 = dynasty.bloodlines.find((b) => b.id === spouse2.bloodlineId);
    const nobleness = (bloodline1 ? 1 : 0) + (bloodline2 ? 1 : 0);
    settlement.mood = Math.min(5, settlement.mood + 1 + nobleness);
  }
  return logs;
}
function tickPregnancies(rng, dynasty, world, worldTime) {
  const logs = [];
  for (const pregnancy of dynasty.pregnancies) {
    const mother = world.npcs.find((n) => n.id === pregnancy.motherId);
    if (!mother || mother.alive === false) {
      dynasty.pregnancies = dynasty.pregnancies.filter((p) => p.id !== pregnancy.id);
      continue;
    }
    if (new Date(pregnancy.dueDate) <= worldTime) {
      logs.push(...processBirth(rng, pregnancy, dynasty, world, worldTime));
    }
  }
  for (const marriage of dynasty.marriages) {
    if (marriage.dissolved)
      continue;
    const spouse1 = world.npcs.find((n) => n.id === marriage.spouse1Id);
    const spouse2 = world.npcs.find((n) => n.id === marriage.spouse2Id);
    if (!spouse1 || !spouse2 || spouse1.alive === false || spouse2.alive === false)
      continue;
    const potentialMother = spouse1;
    const potentialFather = spouse2;
    if (dynasty.pregnancies.some((p) => p.motherId === potentialMother.id))
      continue;
    const motherAge = calculateAge(potentialMother.birthDate, worldTime);
    const charClass = potentialMother.class ?? "Fighter";
    const lifespan = LIFESPAN_BY_CLASS[charClass];
    const fertileEnd = lifespan.elderlyStart * 0.7;
    if (motherAge < lifespan.adulthood || motherAge > fertileEnd)
      continue;
    if (rng.chance(0.00014)) {
      const dueDate = new Date(worldTime.getTime() + 270 * 24 * 60 * 60 * 1000);
      dynasty.pregnancies.push({
        id: `pregnancy-${Date.now()}`,
        motherId: potentialMother.id,
        fatherId: potentialFather.id,
        conceivedAt: worldTime,
        dueDate,
        complications: rng.chance(0.1),
        twins: rng.chance(0.03)
      });
      if (potentialMother.fame && potentialMother.fame >= 2) {
        logs.push({
          category: "town",
          summary: `${potentialMother.name} is with child`,
          details: `Happy news for the household. An heir is expected.`,
          location: potentialMother.location,
          actors: [potentialMother.name, potentialFather.name],
          worldTime,
          realTime: new Date,
          seed: world.seed
        });
      }
    }
  }
  return logs;
}
function processBirth(rng, pregnancy, dynasty, world, worldTime) {
  const logs = [];
  const mother = world.npcs.find((n) => n.id === pregnancy.motherId);
  const father = world.npcs.find((n) => n.id === pregnancy.fatherId);
  if (!mother)
    return logs;
  if (pregnancy.complications && rng.chance(0.2)) {
    if (rng.chance(0.3)) {
      logs.push(...processNaturalDeath(rng, mother, "childbirth", dynasty, world, worldTime));
    } else {
      logs.push({
        category: "town",
        summary: `Tragedy strikes: ${mother.name} loses the child`,
        details: `Despite the healers' efforts, the baby does not survive.`,
        location: mother.location,
        actors: [mother.name],
        worldTime,
        realTime: new Date,
        seed: world.seed
      });
    }
    dynasty.pregnancies = dynasty.pregnancies.filter((p) => p.id !== pregnancy.id);
    return logs;
  }
  const childCount = pregnancy.twins ? 2 : 1;
  const children = [];
  for (let i = 0;i < childCount; i++) {
    const childName = randomName(rng);
    const child = {
      id: `npc-child-${Date.now()}-${i}`,
      name: childName,
      role: "laborer",
      home: mother.home,
      location: mother.location,
      reputation: 0,
      fame: 0,
      alive: true,
      wounded: false,
      bloodlineId: mother.bloodlineId ?? father?.bloodlineId,
      fatherId: father?.id,
      motherId: mother.id,
      childrenIds: [],
      birthDate: worldTime,
      legitimate: !!mother.spouseId && mother.spouseId === father?.id,
      acknowledged: true,
      healthCondition: "healthy",
      titles: [],
      claims: [],
      widowed: false,
      divorces: 0
    };
    if (mother.depth?.traits) {
      child.depth = {
        ...child.depth,
        traits: [rng.pick(mother.depth.traits)],
        background: "noble-exile",
        motivation: "duty",
        relationships: [],
        memories: [],
        quirks: []
      };
    }
    world.npcs.push(child);
    children.push(child);
    if (!mother.childrenIds)
      mother.childrenIds = [];
    mother.childrenIds.push(child.id);
    if (father) {
      if (!father.childrenIds)
        father.childrenIds = [];
      father.childrenIds.push(child.id);
    }
    const bloodline2 = dynasty.bloodlines.find((b) => b.id === child.bloodlineId);
    if (bloodline2) {
      bloodline2.members.push(child.id);
    }
    const marriage = dynasty.marriages.find((m) => (m.spouse1Id === mother.id || m.spouse2Id === mother.id) && !m.dissolved);
    if (marriage) {
      marriage.children.push(child.id);
    }
  }
  dynasty.pregnancies = dynasty.pregnancies.filter((p) => p.id !== pregnancy.id);
  const bloodline = dynasty.bloodlines.find((b) => b.id === mother.bloodlineId);
  logs.push({
    category: "town",
    summary: pregnancy.twins ? `${mother.name} gives birth to twins!` : `${mother.name} gives birth`,
    details: bloodline ? `An heir is born to House ${bloodline.name}. ${children.map((c) => c.name).join(" and ")} ${pregnancy.twins ? "enter" : "enters"} the world.` : `${children[0].name} is born. A new life begins.`,
    location: mother.location,
    actors: [mother.name, ...children.map((c) => c.name)],
    worldTime,
    realTime: new Date,
    seed: world.seed
  });
  const settlement = world.settlements.find((s) => s.name === mother.location);
  if (settlement && bloodline) {
    settlement.mood = Math.min(5, settlement.mood + 1);
  }
  return logs;
}
function tickSuccessionCrises(rng, dynasty, world, worldTime) {
  const logs = [];
  for (const crisis of dynasty.successionCrises) {
    if (crisis.resolved)
      continue;
    const daysSinceStart = (worldTime.getTime() - new Date(crisis.startedAt).getTime()) / (24 * 60 * 60 * 1000);
    if (daysSinceStart < 14)
      continue;
    const resolutionChance = 0.01 + (daysSinceStart - 14) * 0.005;
    if (rng.chance(resolutionChance)) {
      let winner;
      let totalWeight = 0;
      for (const claimant of crisis.claimants) {
        totalWeight += claimant.claimStrength + claimant.supporters.length * 2;
      }
      let roll = rng.int(totalWeight);
      for (const claimant of crisis.claimants) {
        roll -= claimant.claimStrength + claimant.supporters.length * 2;
        if (roll < 0) {
          winner = claimant;
          break;
        }
      }
      if (!winner)
        winner = crisis.claimants[0];
      crisis.resolved = true;
      crisis.resolvedAt = worldTime;
      crisis.winnerId = winner.npcId;
      if (crisis.assetType === "stronghold") {
        const stronghold = world.strongholds.find((s) => s.id === crisis.asset);
        if (stronghold) {
          stronghold.ownerId = winner.npcId;
        }
      } else if (crisis.assetType === "title") {
        const bloodline = dynasty.bloodlines.find((b) => b.id === crisis.asset);
        if (bloodline) {
          bloodline.currentHeadId = winner.npcId;
        }
      }
      logs.push({
        category: "faction",
        summary: `${winner.npcName} wins the ${crisis.title}`,
        details: `After weeks of intrigue and ${winner.method === "force" ? "bloodshed" : "maneuvering"}, the succession crisis is resolved.`,
        location: winner.npcName,
        actors: [winner.npcName],
        worldTime,
        realTime: new Date,
        seed: world.seed
      });
      for (const loser of crisis.claimants.filter((c) => c.npcId !== winner.npcId)) {
        if (rng.chance(0.3)) {
          const loserNpc = world.npcs.find((n) => n.id === loser.npcId);
          const winnerNpc = world.npcs.find((n) => n.id === winner.npcId);
          if (loserNpc && winnerNpc && loserNpc.bloodlineId && winnerNpc.bloodlineId) {
            const loserBloodline = dynasty.bloodlines.find((b) => b.id === loserNpc.bloodlineId);
            const winnerBloodline = dynasty.bloodlines.find((b) => b.id === winnerNpc.bloodlineId);
            if (loserBloodline && winnerBloodline && loserBloodline.id !== winnerBloodline.id) {
              if (!loserBloodline.enemies.includes(winnerBloodline.id)) {
                loserBloodline.enemies.push(winnerBloodline.id);
              }
            }
          }
        }
      }
    }
  }
  return logs;
}
function tickDynasty(rng, dynasty, world, worldTime) {
  const logs = [];
  logs.push(...tickAging(rng, dynasty, world, worldTime));
  logs.push(...tickPregnancies(rng, dynasty, world, worldTime));
  logs.push(...tickCourtships(rng, dynasty, world, worldTime));
  logs.push(...tickSuccessionCrises(rng, dynasty, world, worldTime));
  if (rng.chance(0.005)) {
    const eligibleBachelors = world.npcs.filter((n) => n.alive !== false && !n.spouseId && n.birthDate && calculateAge(n.birthDate, worldTime) >= 18 && calculateAge(n.birthDate, worldTime) <= 50 && (n.fame ?? 0) >= 2);
    const eligiblePartners = world.npcs.filter((n) => n.alive !== false && !n.spouseId && n.birthDate && calculateAge(n.birthDate, worldTime) >= 18 && calculateAge(n.birthDate, worldTime) <= 45);
    if (eligibleBachelors.length > 0 && eligiblePartners.length > 1) {
      const suitor = rng.pick(eligibleBachelors);
      const target = rng.pick(eligiblePartners.filter((p) => p.id !== suitor.id));
      if (target && !dynasty.courtships.some((c) => c.suiterId === suitor.id)) {
        dynasty.courtships.push({
          id: `courtship-${Date.now()}`,
          suiterId: suitor.id,
          targetId: target.id,
          startedAt: worldTime,
          stage: "interest",
          progress: 0,
          obstacles: [],
          gifts: 0
        });
        logs.push({
          category: "town",
          summary: `${suitor.name} shows interest in ${target.name}`,
          details: `Glances are exchanged. Inquiries are made. A courtship may be beginning.`,
          location: suitor.location,
          actors: [suitor.name, target.name],
          worldTime,
          realTime: new Date,
          seed: world.seed
        });
      }
    }
  }
  return logs;
}
function createDynastyState() {
  return {
    bloodlines: [],
    marriages: [],
    pregnancies: [],
    successionCrises: [],
    courtships: [],
    burials: []
  };
}
function seedDynasty(rng, world, worldTime) {
  const dynasty = createDynastyState();
  const notableNpcs = world.npcs.filter((n) => n.alive !== false && ((n.fame ?? 0) >= 3 || (n.level ?? 0) >= 5));
  for (const npc of notableNpcs) {
    if (rng.chance(0.5)) {
      const seat = world.strongholds.find((s) => s.ownerId === npc.id)?.name;
      const bloodline = generateBloodline(rng, npc.id, npc.name, seat);
      dynasty.bloodlines.push(bloodline);
      npc.bloodlineId = bloodline.id;
      npc.birthDate = new Date(worldTime.getTime() - (25 + rng.int(40)) * 365 * 24 * 60 * 60 * 1000);
      npc.childrenIds = [];
      npc.titles = [(npc.level ?? 0) >= 9 ? "Lord" : "Esquire"];
      npc.claims = [];
      npc.legitimate = true;
      npc.acknowledged = true;
      npc.healthCondition = "healthy";
      npc.widowed = false;
      npc.divorces = 0;
    }
  }
  for (const npc of world.npcs) {
    const dynNpc = npc;
    if (!dynNpc.birthDate) {
      dynNpc.birthDate = new Date(worldTime.getTime() - (18 + rng.int(50)) * 365 * 24 * 60 * 60 * 1000);
      dynNpc.childrenIds = [];
      dynNpc.titles = [];
      dynNpc.claims = [];
      dynNpc.legitimate = true;
      dynNpc.acknowledged = true;
      dynNpc.healthCondition = "healthy";
      dynNpc.widowed = false;
      dynNpc.divorces = 0;
    }
  }
  const marriedNpcs = [];
  for (const npc of world.npcs) {
    if (marriedNpcs.includes(npc.id))
      continue;
    if (!npc.birthDate)
      continue;
    const age = calculateAge(npc.birthDate, worldTime);
    if (age < 20 || age > 60)
      continue;
    if (rng.chance(0.3)) {
      const potentialSpouses = world.npcs.filter((s) => s.id !== npc.id && !marriedNpcs.includes(s.id) && s.alive !== false && s.birthDate && calculateAge(s.birthDate, worldTime) >= 18 && calculateAge(s.birthDate, worldTime) <= 60 && s.location === npc.location);
      if (potentialSpouses.length > 0) {
        const spouse = rng.pick(potentialSpouses);
        npc.spouseId = spouse.id;
        spouse.spouseId = npc.id;
        const marriedYearsAgo = rng.int(Math.min(age - 18, 20));
        const marriedAt = new Date(worldTime.getTime() - marriedYearsAgo * 365 * 24 * 60 * 60 * 1000);
        npc.marriedAt = marriedAt;
        spouse.marriedAt = marriedAt;
        marriedNpcs.push(npc.id, spouse.id);
        dynasty.marriages.push({
          id: `marriage-init-${dynasty.marriages.length}`,
          spouse1Id: npc.id,
          spouse2Id: spouse.id,
          marriedAt,
          location: npc.location,
          political: rng.chance(0.3),
          children: [],
          dissolved: false
        });
      }
    }
  }
  return dynasty;
}

// src/naval.ts
var SHIP_CONFIG = {
  "fishing-boat": { crew: 4, cargo: 2, speed: 24, seaworthiness: 0.3, cost: 100, marines: 0 },
  "merchant-cog": { crew: 12, cargo: 20, speed: 48, seaworthiness: 0.6, cost: 2000, marines: 5 },
  longship: { crew: 60, cargo: 10, speed: 90, seaworthiness: 0.5, cost: 3000, marines: 40 },
  galley: { crew: 150, cargo: 30, speed: 72, seaworthiness: 0.4, cost: 1e4, marines: 75 },
  carrack: { crew: 30, cargo: 50, speed: 60, seaworthiness: 0.8, cost: 8000, marines: 20 },
  warship: { crew: 100, cargo: 15, speed: 72, seaworthiness: 0.7, cost: 15000, marines: 60 }
};
var EXOTIC_GOODS = ["spices", "silk", "gems", "ivory", "wine", "dyes"];
var SEA_MONSTERS = [
  "sea-serpent",
  "giant-octopus",
  "dragon-turtle",
  "kraken",
  "merfolk",
  "sahuagin",
  "sea-hag",
  "water-elemental",
  "laceddon",
  "nixie",
  "sea-giant",
  "giant-crab",
  "giant-shark",
  "whale",
  "morkoth"
];
function seedNavalState(world, rng) {
  const state = {
    ships: [],
    seaRoutes: [],
    pirates: [],
    recentShipwrecks: [],
    portActivity: {},
    distantLands: [],
    distantFigures: []
  };
  const ports = world.settlements.filter((s) => s.isPort);
  for (let i = 0;i < ports.length; i++) {
    for (let j = i + 1;j < ports.length; j++) {
      const from = ports[i];
      const to = ports[j];
      const dx = Math.abs(from.coord.q - to.coord.q);
      const dy = Math.abs(from.coord.r - to.coord.r);
      const hexDistance3 = Math.max(dx, dy, Math.abs(dx - dy));
      const distanceDays = Math.max(1, Math.ceil(hexDistance3 / 4));
      state.seaRoutes.push({
        id: `route-${from.id}-${to.id}`,
        from: from.name,
        to: to.name,
        distanceDays,
        dangerLevel: 1 + rng.int(4),
        primaryGoods: rng.shuffle([...EXOTIC_GOODS]).slice(0, 2 + rng.int(3))
      });
    }
  }
  for (const port of ports) {
    const shipCount = port.portSize === "great" ? 3 + rng.int(5) : port.portSize === "major" ? 2 + rng.int(3) : 1 + rng.int(2);
    for (let i = 0;i < shipCount; i++) {
      const shipType = rng.pick(["fishing-boat", "merchant-cog", "carrack"]);
      const config2 = SHIP_CONFIG[shipType];
      state.ships.push({
        id: `ship-${port.id}-${i}`,
        name: generateShipName(rng),
        type: shipType,
        ownerId: port.id,
        ownerName: `Merchants of ${port.name}`,
        status: "docked",
        homePort: port.name,
        currentLocation: port.name,
        cargo: {},
        crew: config2.crew,
        marines: Math.floor(config2.marines * 0.5),
        condition: 80 + rng.int(20)
      });
    }
    state.portActivity[port.name] = {
      shipsInPort: shipCount,
      exoticGoodsAvailable: rng.shuffle([...EXOTIC_GOODS]).slice(0, 1 + rng.int(3))
    };
  }
  if (ports.length >= 2 && rng.chance(0.7)) {
    const pirateCount = 1 + rng.int(2);
    for (let i = 0;i < pirateCount; i++) {
      state.pirates.push({
        id: `pirates-${i}`,
        name: generatePirateName(rng),
        captain: generatePirateCaptainName(rng),
        ships: 1 + rng.int(3),
        crew: 30 + rng.int(70),
        basedAt: "Unknown Cove",
        territory: state.seaRoutes.slice(0, 1 + rng.int(state.seaRoutes.length)).map((r) => r.id),
        notoriety: 20 + rng.int(60),
        bounty: 100 + rng.int(900)
      });
    }
  }
  return state;
}
function generateShipName(rng) {
  const adjectives = [
    "Swift",
    "Gallant",
    "Golden",
    "Silver",
    "Crimson",
    "Azure",
    "Iron",
    "Proud",
    "Lucky",
    "Bold",
    "Faithful",
    "Northern",
    "Southern",
    "Royal",
    "Ancient",
    "Blessed",
    "Storm",
    "Sea",
    "Wind",
    "Star"
  ];
  const nouns = [
    "Maiden",
    "Lady",
    "Queen",
    "Spirit",
    "Dragon",
    "Serpent",
    "Lion",
    "Eagle",
    "Rose",
    "Star",
    "Wave",
    "Tide",
    "Wind",
    "Merchant",
    "Voyager",
    "Fortune",
    "Destiny",
    "Dawn",
    "Dusk",
    "Horizon",
    "Wanderer"
  ];
  return `The ${rng.pick(adjectives)} ${rng.pick(nouns)}`;
}
function generatePirateName(rng) {
  const adjectives = [
    "Black",
    "Red",
    "Crimson",
    "Dread",
    "Shadow",
    "Storm",
    "Blood",
    "Skull",
    "Death",
    "Iron",
    "Ghost",
    "Howling",
    "Raging"
  ];
  const nouns = [
    "Brotherhood",
    "Corsairs",
    "Raiders",
    "Reavers",
    "Wolves",
    "Serpents",
    "Tide",
    "Fleet",
    "Scourge",
    "Terror",
    "Plague",
    "Hunters"
  ];
  return `The ${rng.pick(adjectives)} ${rng.pick(nouns)}`;
}
function generatePirateCaptainName(rng) {
  const titles = [
    "Captain",
    "Admiral",
    "Dread Captain",
    "Black",
    "Red",
    "One-Eyed",
    "Bloody",
    "Iron",
    "Storm",
    "Mad"
  ];
  const names = [
    "Morgan",
    "Blackbeard",
    "Redhand",
    "Silverfin",
    "Darkwater",
    "Stormborn",
    "Daggertooth",
    "Ironhook",
    "Saltblood",
    "Wavecrest",
    "Deepscar",
    "Krakensbane",
    "Tidewraith",
    "Vortex",
    "Maelstrom"
  ];
  return `${rng.pick(titles)} ${rng.pick(names)}`;
}
var LAND_PREFIXES = [
  "Jade",
  "Sapphire",
  "Golden",
  "Silver",
  "Obsidian",
  "Crystal",
  "Amber",
  "Crimson",
  "Azure",
  "Ivory",
  "Ebony",
  "Pearl",
  "Coral",
  "Opal",
  "Onyx",
  "Scarlet",
  "Verdant",
  "Twilight",
  "Dawn",
  "Dusk",
  "Storm",
  "Sun",
  "Moon"
];
var LAND_SUFFIXES = {
  eastern: ["Empire", "Dynasty", "Dominion", "Celestial Realm", "Kingdom of Ten Thousand"],
  southern: ["Kingdoms", "Confederacy", "Tribal Lands", "Coast", "Shore"],
  northern: ["Reaches", "Tundra", "Wastes", "Fjords", "Holdfast"],
  western: ["Republic", "Principalities", "Duchies", "Marches", "Frontier"],
  island: ["Isles", "Archipelago", "Atoll", "Chain", "Sea Kingdom"],
  desert: ["Sands", "Dunes", "Sultanate", "Caliphate", "Oasis Kingdoms"],
  jungle: ["Jungles", "Rainlands", "Serpent Kingdoms", "Vine Realm", "Green Hell"]
};
var LAND_EPITHETS = {
  eastern: ["across the Jade Sea", "beyond the Dragon Gate", "where the sun rises", "of the silk roads"],
  southern: ["beyond the burning straits", "where the monsoons blow", "of endless summer", "past the spice routes"],
  northern: ["beyond the ice", "where winter never ends", "of the aurora", "past the frozen sea"],
  western: ["across the sunset waters", "beyond the horizon", "where the old gods sleep", "of the dying light"],
  island: ["in the endless sea", "beyond the last lighthouse", "where maps end", "of a thousand isles"],
  desert: ["beyond the burning sands", "where the oases bloom", "of the shifting dunes", "past the great waste"],
  jungle: ["in the green darkness", "where the serpents rule", "of the endless canopy", "past the fever swamps"]
};
var LAND_KNOWN_FOR = {
  eastern: [["silk", "jade"], ["martial arts", "paper"], ["fireworks", "tea"], ["porcelain", "philosophy"]],
  southern: [["spices", "elephants"], ["gold", "ivory"], ["drums", "masks"], ["exotic beasts", "tribal magic"]],
  northern: [["furs", "whale oil"], ["berserkers", "rune magic"], ["ice ships", "sea monsters"], ["legendary smiths", "mead"]],
  western: [["banking", "mercenaries"], ["wine", "olive oil"], ["ancient ruins", "lost magic"], ["clockwork", "alchemy"]],
  island: [["pearls", "coral"], ["navigation", "sea-craft"], ["unique creatures", "volcanic glass"], ["cannibals", "hidden temples"]],
  desert: [["glass", "astronomy"], ["horses", "falconry"], ["djinn-binding", "oasis magic"], ["geometric art", "mathematics"]],
  jungle: [["poisons", "healing herbs"], ["feathered serpents", "step pyramids"], ["blood magic", "obsidian"], ["rubber", "cacao"]]
};
var RULER_TITLES = {
  eastern: ["Emperor", "Heavenly Sovereign", "Dragon Throne", "Celestial Majesty", "Divine Ruler"],
  southern: ["High King", "Paramount Chief", "Lion Lord", "Sun King", "Great Chief"],
  northern: ["High Jarl", "Storm King", "Frost Monarch", "All-Father", "Ice Throne"],
  western: ["Doge", "Prince-Elector", "Grand Duke", "Oligarch", "First Citizen"],
  island: ["Sea King", "Island Lord", "Tide Master", "Coral Throne", "Wave Monarch"],
  desert: ["Sultan", "Caliph", "Shah", "Vizier Supreme", "Sand King"],
  jungle: ["Serpent King", "Jaguar Lord", "Green Emperor", "Vine Throne", "Blood King"]
};
var FIGURE_NAMES_BY_CULTURE = {
  eastern: ["Xian", "Zhao", "Ming", "Liu", "Wei", "Chen", "Huang", "Jin", "Long", "Feng"],
  southern: ["Mansa", "Shaka", "Kwame", "Amara", "Zuri", "Kofi", "Nia", "Sekou", "Imani", "Jabari"],
  northern: ["Bjorn", "Ragnar", "Sigrid", "Freya", "Thorin", "Helga", "Orm", "Astrid", "Leif", "Ingrid"],
  western: ["Lorenzo", "Isabella", "Marcus", "Helena", "Cassius", "Octavia", "Nero", "Livia", "Titus", "Claudia"],
  island: ["Kai", "Moana", "Tane", "Leilani", "Koa", "Malia", "Nalu", "Keoni", "Ailani", "Makoa"],
  desert: ["Rashid", "Fatima", "Harun", "Layla", "Omar", "Yasmin", "Khalid", "Amira", "Saladin", "Soraya"],
  jungle: ["Itzamna", "Ixchel", "Kukulkan", "Xochitl", "Tlaloc", "Quetzal", "Cipactli", "Coatl", "Yaotl", "Citlali"]
};
var FIGURE_EPITHETS = [
  "the Magnificent",
  "the Terrible",
  "the Wise",
  "the Cruel",
  "the Golden",
  "the Undying",
  "the Conqueror",
  "the Dreamer",
  "the Mad",
  "the Blessed",
  "the Accursed",
  "the Beloved",
  "the Feared",
  "the Forgotten",
  "the Returned",
  "Worldbreaker",
  "Stormcaller",
  "Sunbringer",
  "Nightwalker",
  "Deathless"
];
var FIGURE_ROLES = [
  "ruler",
  "warlord",
  "merchant-prince",
  "prophet",
  "archmage",
  "pirate-lord",
  "beast-master"
];
var FIGURE_REPUTATIONS = {
  ruler: ["commands absolute loyalty", "rules with an iron fist", "beloved by the common folk", "whispered to be a god incarnate"],
  warlord: ["has never lost a battle", "commands armies beyond counting", "leaves only ashes", "seeks worthy opponents"],
  "merchant-prince": ["owns half the world's trade", "knows every secret", "can buy nations", "trades in the forbidden"],
  prophet: ["speaks with the voice of gods", "sees the future", "commands fanatical followers", "performs miracles"],
  archmage: ["bends reality to their will", "has transcended mortality", "seeks forbidden knowledge", "guards ancient secrets"],
  "pirate-lord": ["rules the sea lanes", "has sunk a hundred ships", "answers to no crown", "knows every hidden cove"],
  "beast-master": ["commands terrible creatures", "speaks to monsters", "rides a dragon", "has tamed the untameable"]
};
function generateDistantLand(rng) {
  const culture = rng.pick(["eastern", "southern", "northern", "western", "island", "desert", "jungle"]);
  const prefix = rng.pick(LAND_PREFIXES);
  const suffix = rng.pick(LAND_SUFFIXES[culture]);
  return {
    id: `distant-land-${Date.now()}-${rng.int(1e4)}`,
    name: `the ${prefix} ${suffix}`,
    epithet: rng.pick(LAND_EPITHETS[culture]),
    culture,
    knownFor: rng.pick(LAND_KNOWN_FOR[culture]),
    rulerTitle: rng.pick(RULER_TITLES[culture]),
    mentionCount: 0
  };
}
function generateDistantFigure(rng, land) {
  const role = rng.pick(FIGURE_ROLES);
  const baseName = rng.pick(FIGURE_NAMES_BY_CULTURE[land.culture]);
  const epithet = rng.pick(FIGURE_EPITHETS);
  const title = role === "ruler" ? `${land.rulerTitle} ${baseName}` : `${baseName} ${epithet}`;
  return {
    id: `distant-figure-${Date.now()}-${rng.int(1e4)}`,
    name: baseName,
    title,
    landId: land.id,
    role,
    reputation: rng.pick(FIGURE_REPUTATIONS[role]),
    alive: true,
    mentionCount: 0
  };
}
function getOrCreateDistantLand(rng, state) {
  if (state.distantLands.length > 0 && rng.chance(0.7)) {
    const land = rng.pick(state.distantLands);
    land.mentionCount++;
    land.lastMentioned = new Date;
    return land;
  }
  const newLand = generateDistantLand(rng);
  newLand.mentionCount = 1;
  newLand.lastMentioned = new Date;
  state.distantLands.push(newLand);
  return newLand;
}
function getOrCreateDistantFigure(rng, state, land) {
  const landFigures = state.distantFigures.filter((f) => f.landId === land.id && f.alive);
  if (landFigures.length > 0 && rng.chance(0.6)) {
    const figure = rng.pick(landFigures);
    figure.mentionCount++;
    figure.lastMentioned = new Date;
    return figure;
  }
  const newFigure = generateDistantFigure(rng, land);
  newFigure.mentionCount = 1;
  newFigure.lastMentioned = new Date;
  state.distantFigures.push(newFigure);
  return newFigure;
}
function generateExoticRumor(rng, state) {
  const land = getOrCreateDistantLand(rng, state);
  const figure = getOrCreateDistantFigure(rng, state, land);
  const RUMORS = [
    {
      kind: "distant-war",
      texts: [
        `War has broken out in ${land.name}. ${figure.title} marshals armies beyond counting.`,
        `${figure.title} has been overthrown in ${land.name}. Chaos spreads across the realm.`,
        `A great battle was fought in ${land.name}. The dead number in the thousands.`,
        `${land.name} has fallen to invaders from ${land.epithet}.`,
        `Civil war tears ${land.name} apart. Refugees flee by the shipload.`,
        `${figure.title} demands tribute from all neighboring kingdoms.`
      ]
    },
    {
      kind: "distant-treasure",
      texts: [
        `${figure.title} has discovered a treasure vault beneath ${land.name}. Gold beyond measure.`,
        `A merchant from ${land.name} arrived with ${rng.pick(land.knownFor)} worth a king's ransom.`,
        `The lost fleet of ${land.name} has been found—holds still full of ancient gold.`,
        `${figure.title} offers a fortune for adventurers willing to sail ${land.epithet}.`,
        `The mines of ${land.name} have struck a new vein. ${figure.title} grows richer by the day.`,
        `A dying sailor spoke of a map to the treasure of ${land.name}.`
      ]
    },
    {
      kind: "distant-monster",
      texts: [
        `A great sea beast has destroyed three ships bound for ${land.name}.`,
        `${figure.title} battles a dragon that has made its lair in ${land.name}.`,
        `The sailors speak of leviathans stirring in the waters ${land.epithet}.`,
        `Something ancient has awakened beneath ${land.name}. Ships flee the coast.`,
        `${land.name} is overrun with creatures from the deep places.`,
        `A kraken was sighted in waters ${land.epithet}. Trade routes are abandoned.`
      ]
    },
    {
      kind: "distant-plague",
      texts: [
        `A terrible plague sweeps ${land.name}. The dead walk in the streets.`,
        `${land.name} has been struck by a great earthquake. Cities crumble.`,
        `Famine grips ${land.name}. They say people resort to terrible things.`,
        `A cursed fog has descended on ${land.name}. None who enter return.`,
        `The waters around ${land.name} have turned to blood. Fish die in heaps.`,
        `${figure.title} has sealed the borders of ${land.name}. No one knows why.`
      ]
    },
    {
      kind: "distant-magic",
      texts: [
        `The wizards of ${land.name} have opened a gate to another world.`,
        `${figure.title} has achieved immortality through forbidden rites.`,
        `A new moon appeared over ${land.name} last month. It still hangs there.`,
        `${land.name} is said to possess a weapon that can sink entire fleets.`,
        `The oracles of ${land.name} have seen a vision of the world's ending.`,
        `Strange lights in the sky over ${land.name}. The stars themselves move.`
      ]
    },
    {
      kind: "distant-trade",
      texts: [
        `${land.name} seeks new trading partners. Their ${rng.pick(land.knownFor)} are beyond compare.`,
        `${figure.title} has cornered the ${rng.pick(land.knownFor)} market. Prices will triple.`,
        `A new sea route ${land.epithet} has been discovered. Fortunes to be made.`,
        `The guilds of ${land.name} craft wonders unknown in these lands.`,
        `${land.name} exports substances that grant visions of the future.`,
        `${figure.title} seeks rare components. Pays in rubies.`
      ]
    }
  ];
  const category = rng.pick(RUMORS);
  const text = rng.pick(category.texts);
  return {
    text,
    kind: category.kind,
    landId: land.id,
    figureId: figure.id
  };
}
function tickNavalHourly(state, world, rng, worldTime, weather) {
  const logs = [];
  for (const ship of state.ships) {
    if (ship.status !== "at-sea" || !ship.arrivesAt)
      continue;
    const arrivesAt = new Date(ship.arrivesAt);
    if (worldTime >= arrivesAt) {
      ship.status = "docked";
      ship.currentLocation = ship.destination;
      const port = world.settlements.find((s) => s.name === ship.destination);
      if (port) {
        const deliveredGoods = Object.keys(ship.cargo);
        const exoticDelivered = deliveredGoods.filter((g) => EXOTIC_GOODS.includes(g));
        if (exoticDelivered.length > 0) {
          logs.push({
            category: "town",
            summary: `${ship.name} arrives in ${port.name} with exotic cargo`,
            details: `The ship brings ${exoticDelivered.join(", ")} from distant shores. Merchants rush to bid.`,
            location: port.name,
            worldTime,
            realTime: new Date,
            seed: world.seed
          });
          const portActivity = state.portActivity[port.name] ?? { shipsInPort: 0, exoticGoodsAvailable: [] };
          for (const good of exoticDelivered) {
            if (!portActivity.exoticGoodsAvailable.includes(good)) {
              portActivity.exoticGoodsAvailable.push(good);
            }
          }
          portActivity.shipsInPort++;
          portActivity.lastArrival = worldTime;
          state.portActivity[port.name] = portActivity;
          if (rng.chance(0.25)) {
            const exoticRumor = generateExoticRumor(rng, state);
            const rumorLand = state.distantLands.find((l) => l.id === exoticRumor.landId);
            logs.push({
              category: "town",
              summary: `Sailors bring tales from ${rumorLand?.name ?? "distant lands"}`,
              details: `The crew of ${ship.name} shares news from across the sea: "${exoticRumor.text}"`,
              location: port.name,
              worldTime,
              realTime: new Date,
              seed: world.seed
            });
          }
        } else {
          logs.push({
            category: "town",
            summary: `${ship.name} makes port in ${port.name}`,
            details: `Another vessel completes its voyage safely.`,
            location: port.name,
            worldTime,
            realTime: new Date,
            seed: world.seed
          });
          if (rng.chance(0.15)) {
            const exoticRumor = generateExoticRumor(rng, state);
            const rumorLand = state.distantLands.find((l) => l.id === exoticRumor.landId);
            logs.push({
              category: "town",
              summary: `Sailors bring tales from ${rumorLand?.name ?? "distant lands"}`,
              details: `The crew of ${ship.name} shares news from across the sea: "${exoticRumor.text}"`,
              location: port.name,
              worldTime,
              realTime: new Date,
              seed: world.seed
            });
          }
        }
      }
      ship.destination = undefined;
      ship.departedAt = undefined;
      ship.arrivesAt = undefined;
      ship.cargo = {};
    }
  }
  return logs;
}
function tickNavalDaily(state, world, rng, worldTime, weather, season) {
  const logs = [];
  const dockedMerchants = state.ships.filter((s) => s.status === "docked" && (s.type === "merchant-cog" || s.type === "carrack"));
  for (const ship of dockedMerchants) {
    let departChance = 0.15;
    if (weather === "storm")
      departChance = 0.02;
    else if (weather === "rain")
      departChance = 0.08;
    if (season === "winter")
      departChance *= 0.5;
    if (rng.chance(departChance)) {
      const routes = state.seaRoutes.filter((r) => r.from === ship.currentLocation || r.to === ship.currentLocation);
      if (routes.length > 0) {
        const route = rng.pick(routes);
        const destination = route.from === ship.currentLocation ? route.to : route.from;
        let voyageDays = route.distanceDays;
        if (weather === "storm")
          voyageDays *= 2;
        else if (weather === "rain")
          voyageDays = Math.ceil(voyageDays * 1.5);
        if (season === "winter")
          voyageDays = Math.ceil(voyageDays * 1.3);
        const voyageHours = voyageDays * 24;
        ship.status = "at-sea";
        ship.destination = destination;
        ship.departedAt = worldTime;
        ship.arrivesAt = new Date(worldTime.getTime() + voyageHours * 60 * 60 * 1000);
        const cargo = {};
        for (const good of route.primaryGoods) {
          if (rng.chance(0.5)) {
            cargo[good] = 1 + rng.int(5);
          }
        }
        ship.cargo = cargo;
        const portActivity = state.portActivity[ship.currentLocation];
        if (portActivity) {
          portActivity.shipsInPort = Math.max(0, portActivity.shipsInPort - 1);
          portActivity.lastDeparture = worldTime;
        }
        const cargoDesc = Object.keys(cargo).length > 0 ? `carrying ${Object.keys(cargo).join(", ")}` : "with empty holds seeking cargo";
        logs.push({
          category: "town",
          summary: `${ship.name} sets sail from ${ship.currentLocation}`,
          details: `The ${ship.type} departs for ${destination}, ${cargoDesc}. Expected voyage: ${voyageDays} days.`,
          location: ship.currentLocation,
          worldTime,
          realTime: new Date,
          seed: world.seed
        });
      }
    }
  }
  for (const pirates of state.pirates) {
    let raidChance = 0.08;
    if (weather === "storm")
      raidChance = 0.01;
    if (season === "summer")
      raidChance *= 1.5;
    if (pirates.lastRaid) {
      const daysSinceRaid = (worldTime.getTime() - new Date(pirates.lastRaid).getTime()) / (24 * 60 * 60 * 1000);
      if (daysSinceRaid < 3)
        raidChance = 0;
    }
    if (rng.chance(raidChance)) {
      const targets = state.ships.filter((s) => s.status === "at-sea" && s.type !== "warship" && state.seaRoutes.some((r) => pirates.territory.includes(r.id) && (r.from === s.homePort || r.to === s.destination)));
      if (targets.length > 0) {
        const target = rng.pick(targets);
        pirates.lastRaid = worldTime;
        const pirateStrength = pirates.crew * 0.8;
        const targetStrength = target.marines * 1 + target.crew * 0.3;
        const pirateRoll = pirateStrength * (0.5 + rng.next());
        const targetRoll = targetStrength * (0.5 + rng.next());
        if (pirateRoll > targetRoll * 1.5) {
          logs.push({
            category: "road",
            summary: `${pirates.name} capture ${target.name}!`,
            details: `${pirates.captain} and their crew overwhelm the ${target.type}. The cargo is seized, the crew ransomed or pressed into service.`,
            location: "the high seas",
            actors: [pirates.captain, target.ownerName],
            worldTime,
            realTime: new Date,
            seed: world.seed
          });
          target.status = "shipwrecked";
          target.currentLocation = "captured";
          pirates.notoriety = Math.min(100, pirates.notoriety + 10);
          pirates.bounty += 100 + rng.int(200);
        } else if (pirateRoll > targetRoll) {
          logs.push({
            category: "road",
            summary: `${pirates.name} raid ${target.name}`,
            details: `${pirates.captain}'s corsairs board and plunder the vessel, but it limps away with survivors.`,
            location: "the high seas",
            actors: [pirates.captain, target.ownerName],
            worldTime,
            realTime: new Date,
            seed: world.seed
          });
          target.condition = Math.max(20, target.condition - 30);
          target.cargo = {};
          pirates.notoriety = Math.min(100, pirates.notoriety + 5);
        } else {
          logs.push({
            category: "road",
            summary: `${target.name} repels pirate attack`,
            details: `${pirates.name} attempt to take the ${target.type}, but the crew fights them off. The corsairs withdraw with casualties.`,
            location: "the high seas",
            actors: [pirates.captain, target.ownerName],
            worldTime,
            realTime: new Date,
            seed: world.seed
          });
          pirates.crew = Math.max(10, pirates.crew - 5 - rng.int(10));
          target.condition = Math.max(40, target.condition - 15);
        }
      }
    }
  }
  if (weather === "storm") {
    const shipsAtSea = state.ships.filter((s) => s.status === "at-sea");
    for (const ship of shipsAtSea) {
      const config2 = SHIP_CONFIG[ship.type];
      const survivalChance = config2.seaworthiness * (ship.condition / 100);
      if (rng.chance(0.2)) {
        if (rng.chance(survivalChance)) {
          logs.push({
            category: "weather",
            summary: `${ship.name} weathers the storm`,
            details: `The ${ship.type} is battered but stays afloat. Repairs will be needed.`,
            location: "the high seas",
            worldTime,
            realTime: new Date,
            seed: world.seed
          });
          ship.condition = Math.max(30, ship.condition - 20 - rng.int(20));
          if (ship.arrivesAt) {
            ship.arrivesAt = new Date(ship.arrivesAt.getTime() + 12 * 60 * 60 * 1000);
          }
        } else {
          logs.push({
            category: "weather",
            summary: `${ship.name} lost in the storm!`,
            details: `The ${ship.type} founders in the tempest. Wreckage may wash ashore. ${ship.crew} souls aboard.`,
            location: "the high seas",
            worldTime,
            realTime: new Date,
            seed: world.seed
          });
          ship.status = "shipwrecked";
          state.recentShipwrecks.push({
            shipName: ship.name,
            location: ship.destination ?? "unknown waters",
            date: worldTime,
            cargo: { ...ship.cargo },
            salvaged: false
          });
        }
      }
    }
  }
  if (rng.chance(0.03)) {
    const ports = world.settlements.filter((s) => s.isPort);
    if (ports.length > 0) {
      const port = rng.pick(ports);
      const monster = rng.pick([...SEA_MONSTERS]);
      const MONSTER_DESCRIPTIONS = {
        "sea-serpent": {
          summary: `Sea serpent spotted near ${port.name}`,
          details: "Fishermen report a massive scaled form in the waves. Several boats refuse to leave harbor."
        },
        "giant-octopus": {
          summary: `Giant octopus attacks boat near ${port.name}`,
          details: "Tentacles the size of masts drag a fishing vessel under. One survivor babbles of eyes like cartwheels."
        },
        "dragon-turtle": {
          summary: `Dragon turtle surfaces off ${port.name}`,
          details: "The ancient creature rises from the deep. Its shell is an island. Its breath is steam. Offerings are prepared."
        },
        kraken: {
          summary: `The kraken stirs in waters near ${port.name}`,
          details: "Sailors whisper the dread name. Ships are kept in harbor. The sea itself seems to hold its breath."
        },
        merfolk: {
          summary: `Merfolk seen near ${port.name}`,
          details: "The sea folk have been spotted watching the harbor. Their intentions are unknown."
        },
        sahuagin: {
          summary: `Sahuagin raid coast near ${port.name}`,
          details: "The fish-men emerge from the waves at night. A fishing hamlet is found empty, blood on the sand."
        },
        "sea-hag": {
          summary: `Sea hag's curse afflicts ${port.name}`,
          details: "Nets come up empty. Hulls rot overnight. Someone has angered the old woman of the waves."
        },
        "water-elemental": {
          summary: `Water elemental rampages near ${port.name}`,
          details: "A living wave tears through the harbor. Some wizard's summoning gone wrong, perhaps."
        },
        laceddon: {
          summary: `Drowned dead walk near ${port.name}`,
          details: "Corpses of the drowned claw up from the sea. The beach becomes a battlefield."
        },
        nixie: {
          summary: `Nixies enchant sailors near ${port.name}`,
          details: "Men walk into the sea in a trance. Some do not return."
        },
        "sea-giant": {
          summary: `Sea giant demands tribute from ${port.name}`,
          details: "The giant wades in the shallows, demanding gold and cattle. The harbor master negotiates."
        },
        "giant-crab": {
          summary: `Giant crabs emerge near ${port.name}`,
          details: "Monstrous crustaceans scuttle onto the beach. Their claws can sever a man in two."
        },
        "giant-shark": {
          summary: `Giant shark terrorizes waters near ${port.name}`,
          details: "A fin the size of a sail circles the harbor. Swimming is forbidden."
        },
        whale: {
          summary: `Great whale sighted off ${port.name}`,
          details: "A leviathan surfaces, spraying water high. An omen, say the old sailors. But of what?"
        },
        morkoth: {
          summary: `Strange disappearances near ${port.name}`,
          details: "Ships vanish in calm seas. Survivors speak of hypnotic lights in the deep."
        }
      };
      const desc = MONSTER_DESCRIPTIONS[monster] ?? {
        summary: `Sea creature spotted near ${port.name}`,
        details: "Something lurks in the waters. Sailors are wary."
      };
      logs.push({
        category: "road",
        summary: desc.summary,
        details: desc.details,
        location: port.name,
        worldTime,
        realTime: new Date,
        seed: world.seed
      });
    }
  }
  const unsalvaged = state.recentShipwrecks.filter((w) => !w.salvaged);
  if (unsalvaged.length > 0 && rng.chance(0.1)) {
    const wreck = rng.pick(unsalvaged);
    const ports = world.settlements.filter((s) => s.isPort);
    if (ports.length > 0) {
      const port = rng.pick(ports);
      logs.push({
        category: "town",
        summary: `Wreckage of ${wreck.shipName} washes ashore near ${port.name}`,
        details: `Salvagers rush to the beach. Cargo may be recoverable.`,
        location: port.name,
        worldTime,
        realTime: new Date,
        seed: world.seed
      });
      wreck.salvaged = true;
    }
  }
  for (const [portName, activity] of Object.entries(state.portActivity)) {
    if (rng.chance(0.1) && activity.exoticGoodsAvailable.length > 0) {
      const sold = activity.exoticGoodsAvailable.pop();
    }
  }
  return logs;
}
function markSettlementAsPort(settlement, rng) {
  settlement.isPort = true;
  if (settlement.type === "city") {
    settlement.portSize = rng.chance(0.3) ? "great" : "major";
  } else if (settlement.type === "town") {
    settlement.portSize = rng.chance(0.5) ? "major" : "minor";
  } else {
    settlement.portSize = "minor";
  }
  settlement.shipyard = settlement.type === "city" || settlement.type === "town" && rng.chance(0.3);
  settlement.lighthouse = settlement.portSize === "great" || settlement.portSize === "major" && rng.chance(0.5);
}

// src/index.ts
var bus = new EventBus;
var rng = makeRandom(config.seed);
var logger = new Logger(config.logDir);
var world;
var calendar;
var antagonists = [];
var storyThreads = [];
var legendaryState = createLegendaryState();
var retainerRoster = createRetainerRoster();
var guildState = createGuildState();
var ecologyState = createEcologyState();
var dynastyState = createDynastyState();
var treasureState = createTreasureState();
var navalState = { ships: [], seaRoutes: [], pirates: [], recentShipwrecks: [], portActivity: {}, distantLands: [], distantFigures: [] };
var initialized = false;
async function log(entry) {
  const fullEntry = { ...entry, realTime: new Date };
  await logger.log(fullEntry);
  if (entry.category !== "weather" && entry.category !== "system") {
    const newStory = checkForStorySpawn(fullEntry, world, rng, storyThreads);
    if (newStory) {
      storyThreads.push(newStory);
      await log({
        category: "faction",
        summary: `A new tale begins: "${newStory.title}"`,
        details: newStory.summary,
        location: newStory.location,
        actors: newStory.actors,
        worldTime: entry.worldTime,
        seed: config.seed
      });
    }
    analyzeEventForConsequences(fullEntry, world, rng);
  }
}
async function initWorld() {
  const loaded = await loadWorld();
  if (loaded) {
    world = loaded;
    if (world.consequenceQueue) {
      setConsequenceQueue(world.consequenceQueue);
    }
    for (let i = 0;i < world.npcs.length; i++) {
      const npc = world.npcs[i];
      if (!npc.depth) {
        world.npcs[i] = deepenNPC(rng, npc);
      }
    }
    calendar = getCalendarFromDate(config.startWorldTime, world.calendar?.weather);
    if (world.calendar) {
      calendar = { ...calendar, ...world.calendar };
    }
    antagonists = world.antagonists ?? [];
    storyThreads = world.storyThreads ?? [];
    legendaryState = world.legendaryState ?? createLegendaryState();
    retainerRoster = world.retainerRoster ?? createRetainerRoster();
    guildState = world.guildState ?? createGuildState();
    ecologyState = world.ecologyState ?? createEcologyState();
    dynastyState = world.dynastyState ?? createDynastyState();
    treasureState = world.treasureState ?? createTreasureState();
    navalState = world.navalState ?? { ships: [], seaRoutes: [], pirates: [], recentShipwrecks: [], portActivity: {}, distantLands: [], distantFigures: [] };
  } else {
    world = createInitialWorld(rng, config.seed, config.startWorldTime);
    world.npcs = world.npcs.map((npc) => deepenNPC(rng, npc));
    seedRelationships(rng, world.npcs, world);
    calendar = getCalendarFromDate(config.startWorldTime);
    calendar.weather = generateWeather(rng, getSeason(calendar.month));
    antagonists = seedAntagonists(rng, world);
    guildState = seedGuilds(rng, world, config.startWorldTime);
    ecologyState = seedEcology(rng, world, config.startWorldTime);
    dynastyState = seedDynasty(rng, world, config.startWorldTime);
    for (const settlement of world.settlements) {
      if (isCoastalHex(world, settlement.coord)) {
        markSettlementAsPort(settlement, rng);
      }
    }
    navalState = seedNavalState(world, rng);
    await log({
      category: "system",
      summary: `The chronicle begins: ${world.archetype}`,
      details: `${formatDate(calendar)}. The simulation awakens in an era known as the ${world.archetype}.`,
      worldTime: config.startWorldTime,
      seed: config.seed
    });
    for (const settlement of world.settlements) {
      const scene = settlementScene(rng, settlement, config.startWorldTime);
      await log({
        category: "town",
        summary: `${settlement.name} stirs to life`,
        details: scene,
        location: settlement.name,
        worldTime: config.startWorldTime,
        seed: config.seed
      });
    }
    for (const ant of antagonists) {
      const introLogs = introduceAntagonist(ant, world, rng, config.startWorldTime);
      for (const l of introLogs)
        await log(l);
    }
    await saveWorld(world);
  }
  initialized = true;
}
function onHourTick(event) {
  if (!initialized)
    return;
  (async () => {
    for (const party of world.parties) {
      if (party.status === "travel" && party.travel) {
        const sign = encounterSign(rng, party.travel.terrain, event.worldTime, party.location, party.name, world.seed);
        if (sign)
          await log(sign);
        const enc = enhancedEncounter(rng, party.travel.terrain, event.worldTime, party.location, party, world, calendar);
        if (enc) {
          if (enc.delayMiles)
            party.travel.milesRemaining += enc.delayMiles;
          if (enc.fatigueDelta)
            party.fatigue = (party.fatigue ?? 0) + enc.fatigueDelta;
          if (enc.injured) {
            party.wounded = true;
            party.restHoursRemaining = Math.max(party.restHoursRemaining ?? 0, 24);
          }
          if (enc.death) {
            party.fame = Math.max(0, (party.fame ?? 0) - 1);
          } else if (enc.category === "road") {
            party.fame = (party.fame ?? 0) + 1;
          }
          await log(enc);
        }
        const legendaryEncs = checkLegendaryEncounter(rng, party, party.location, legendaryState, event.worldTime, world.seed, world, antagonists, storyThreads);
        for (const lEnc of legendaryEncs) {
          await log(lEnc);
          party.fame = (party.fame ?? 0) + 5;
        }
      }
    }
    const travelLogs = updateTravel(world, rng, event.worldTime);
    for (const entry of travelLogs)
      await log(entry);
    const caravanLogs = advanceCaravans(world, rng, event.worldTime);
    for (const entry of caravanLogs)
      await log(entry);
    const conseqLogs = processConsequences(world, rng, event.worldTime);
    for (const entry of conseqLogs)
      await log(entry);
    if (rng.chance(0.05)) {
      const npc = rng.pick(world.npcs);
      if (npc.depth && npc.alive !== false) {
        const relEvent = relationshipEvent(rng, npc, world, event.worldTime);
        if (relEvent)
          await log(relEvent);
      }
    }
    if (rng.chance(0.03)) {
      const activeAntagonists = antagonists.filter((a) => a.alive);
      if (activeAntagonists.length) {
        const ant = rng.pick(activeAntagonists);
        const antLogs = antagonistAct(ant, world, rng, event.worldTime);
        for (const l of antLogs)
          await log(l);
      }
    }
    if (rng.chance(0.1)) {
      const storyLogs = tickStories(rng, storyThreads, world, event.worldTime);
      for (const l of storyLogs)
        await log(l);
    }
    const npcAgencyLogs = tickNPCAgency(world, rng, event.worldTime, antagonists, storyThreads);
    for (const l of npcAgencyLogs)
      await log(l);
    const partyAgencyLogs = tickPartyAgency(world, rng, event.worldTime, antagonists, storyThreads);
    for (const l of partyAgencyLogs)
      await log(l);
    const factionOpLogs = tickFactionOperations(world, rng, event.worldTime, antagonists, storyThreads);
    for (const l of factionOpLogs)
      await log(l);
    const spellLogs = tickSpellcasting(world, rng, event.worldTime);
    for (const l of spellLogs)
      await log(l);
    const nexusLogs = tickNexuses(world, rng, event.worldTime);
    for (const l of nexusLogs)
      await log(l);
    const levelLogs = tickLevelUps(world, rng, event.worldTime);
    for (const l of levelLogs)
      await log(l);
    const raisingLogs = tickArmyRaising(world, rng, event.worldTime);
    for (const l of raisingLogs)
      await log(l);
    const ruinLogs = tickRuins(world, rng, event.worldTime);
    for (const entry of ruinLogs)
      await log(entry);
    const armyLogs = tickArmies(world, rng, event.worldTime);
    for (const l of armyLogs)
      await log(l);
    const diseaseLogs = tickDisease(world, rng, event.worldTime);
    for (const l of diseaseLogs)
      await log(l);
    const mercLogs = tickMercenaries(world, rng, event.worldTime);
    for (const l of mercLogs)
      await log(l);
    const diplomacyLogs = tickDiplomacy(world, rng, event.worldTime);
    for (const l of diplomacyLogs)
      await log(l);
    const retainerLogs = tickRetainers(rng, retainerRoster, world, event.worldTime);
    for (const l of retainerLogs)
      await log(l);
    const guildLogs = tickGuilds(rng, guildState, world, event.worldTime);
    for (const l of guildLogs)
      await log(l);
    const ecologyLogs = tickEcology(rng, ecologyState, world, antagonists, event.worldTime);
    for (const l of ecologyLogs)
      await log(l);
    const dynastyLogs = tickDynasty(rng, dynastyState, world, event.worldTime);
    for (const l of dynastyLogs)
      await log(l);
    const treasureLogs = tickTreasure(rng, treasureState, world, event.worldTime);
    for (const l of treasureLogs)
      await log(l);
    const navalHourlyLogs = tickNavalHourly(navalState, world, rng, event.worldTime, calendar.weather);
    for (const l of navalHourlyLogs)
      await log(l);
    world.calendar = calendar;
    world.antagonists = antagonists;
    world.storyThreads = storyThreads;
    world.consequenceQueue = getConsequenceQueue();
    world.retainerRoster = retainerRoster;
    world.guildState = guildState;
    world.ecologyState = ecologyState;
    world.dynastyState = dynastyState;
    world.treasureState = treasureState;
    world.navalState = navalState;
    world.lastTickAt = event.worldTime;
    await saveWorld(world);
  })();
}
function pruneOldData(worldTime) {
  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
  const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
  const now = worldTime.getTime();
  storyThreads = storyThreads.filter((s) => {
    if (!s.resolved)
      return true;
    const resolvedTime = s.lastUpdated?.getTime() ?? s.startedAt.getTime();
    return now - resolvedTime < THIRTY_DAYS_MS;
  });
  antagonists = antagonists.filter((a) => {
    if (a.alive)
      return true;
    const lastSeen = a.lastSeen?.getTime() ?? 0;
    return now - lastSeen < NINETY_DAYS_MS;
  });
  world.npcs = world.npcs.filter((n) => {
    if (n.alive !== false)
      return true;
    const npcAny = n;
    const hasMeaningfulHistory = npcAny.memories?.length > 5 || (n.fame ?? 0) > 10;
    if (hasMeaningfulHistory)
      return true;
    const deathTime = npcAny.diedAt?.getTime() ?? 0;
    return now - deathTime < NINETY_DAYS_MS;
  });
  if (navalState.distantLands.length > 50) {
    navalState.distantLands = navalState.distantLands.sort((a, b) => (b.mentionCount ?? 0) - (a.mentionCount ?? 0)).slice(0, 50);
  }
  if (navalState.distantFigures.length > 100) {
    navalState.distantFigures = navalState.distantFigures.filter((f) => f.alive).sort((a, b) => (b.mentionCount ?? 0) - (a.mentionCount ?? 0)).slice(0, 100);
  }
}
function onDayTick(event) {
  if (!initialized)
    return;
  (async () => {
    pruneOldData(event.worldTime);
    const { logs: calendarLogs, newCalendar } = dailyCalendarTick(world, rng, event.worldTime, calendar);
    calendar = newCalendar;
    for (const entry of calendarLogs)
      await log(entry);
    const startLogs = maybeStartTravel(world, rng, event.worldTime);
    for (const entry of startLogs)
      await log(entry);
    for (const settlement of world.settlements) {
      const npcsHere = world.npcs.filter((n) => n.location === settlement.name && n.alive !== false);
      const partiesHere = world.parties.filter((p) => p.location === settlement.name);
      const beat = marketBeat(rng, settlement, event.worldTime, {
        npcs: npcsHere,
        parties: partiesHere,
        tension: settlement.mood
      });
      if (beat) {
        await log({
          category: "town",
          summary: beat.summary,
          details: beat.details,
          location: settlement.name,
          worldTime: event.worldTime,
          seed: config.seed
        });
      }
    }
    const townLogs = dailyTownTick(world, rng, event.worldTime);
    for (const entry of townLogs)
      await log(entry);
    const domainLogs = tickDomains(world, rng, event.worldTime);
    for (const entry of domainLogs)
      await log(entry);
    const legendaryLogs = maybeLegendarySpike(rng, world, event.worldTime, legendaryState);
    for (const entry of legendaryLogs)
      await log(entry);
    const navalDailyLogs = tickNavalDaily(navalState, world, rng, event.worldTime, calendar.weather, getSeason(calendar.month));
    for (const l of navalDailyLogs)
      await log(l);
    world.calendar = calendar;
    world.antagonists = antagonists;
    world.storyThreads = storyThreads;
    world.consequenceQueue = getConsequenceQueue();
    world.retainerRoster = retainerRoster;
    world.guildState = guildState;
    world.ecologyState = ecologyState;
    world.dynastyState = dynastyState;
    world.treasureState = treasureState;
    world.navalState = navalState;
    world.lastTickAt = event.worldTime;
    world.legendaryState = legendaryState;
    await saveWorld(world);
  })();
}
function onTurnTick(event) {
  (async () => {
    for (const party of world.parties) {
      if (party.status === "idle") {
        const dungeon = world.dungeons.find((d) => d.name === party.location);
        if (dungeon && dungeon.rooms && dungeon.rooms.length > 0) {
          const delveLogs = exploreDungeonTick(rng, dungeon, [party.name], event.worldTime, world.seed, world, treasureState);
          for (const entry of delveLogs)
            await log(entry);
        }
      }
    }
  })();
}
async function simulateTurn(worldTime, turnIndex) {
  const tick = { kind: "turn", worldTime, turnIndex };
  onTurnTick(tick);
  if (turnIndex % config.hourTurns === 0) {
    onHourTick({ ...tick, kind: "hour" });
  }
  if (turnIndex % (config.hourTurns * config.dayHours) === 0) {
    onDayTick({ ...tick, kind: "day" });
  }
}
async function catchUpMissedTime() {
  if (!config.catchUp) {
    console.log(`⏰ Catch-up disabled (SIM_CATCH_UP=false)`);
    return;
  }
  if (!world.lastTickAt) {
    console.log(`⏰ No lastTickAt in world - starting fresh (no catch-up needed)`);
    return;
  }
  const lastTick = new Date(world.lastTickAt);
  const now = new Date;
  const missedMs = now.getTime() - lastTick.getTime();
  const turnMs = config.turnMinutes * 60 * 1000;
  const missedTurns = Math.floor(missedMs / turnMs);
  if (missedTurns <= 0) {
    console.log(`⏰ World is current (lastTickAt: ${lastTick.toISOString()})`);
    return;
  }
  const maxCatchUp = 7 * 24 * 6;
  const turnsToSimulate = Math.min(missedTurns, maxCatchUp);
  const missedDays = Math.floor(missedTurns / (config.hourTurns * config.dayHours));
  const missedHours = Math.floor(missedTurns % (config.hourTurns * config.dayHours) / config.hourTurns);
  console.log(`
⏰ Catching up ${missedDays}d ${missedHours}h of missed time (${turnsToSimulate} turns)...`);
  const catchUpDelayMs = 1000 / config.catchUpSpeed;
  let simulatedTurns = 0;
  for (let i = 0;i < turnsToSimulate; i++) {
    const turnWorldTime = new Date(lastTick.getTime() + (i + 1) * turnMs);
    await simulateTurn(turnWorldTime, i + 1);
    simulatedTurns++;
    if (simulatedTurns % 100 === 0) {
      const pct = Math.floor(simulatedTurns / turnsToSimulate * 100);
      process.stdout.write(`\r⏰ Catch-up progress: ${pct}% (${simulatedTurns}/${turnsToSimulate} turns)`);
    }
    await new Promise((r) => setTimeout(r, catchUpDelayMs));
  }
  console.log(`
✓ Caught up! World time is now synchronized.`);
  world.lastTickAt = now;
  await saveWorld(world);
}
async function main() {
  await initWorld();
  bus.subscribe("turn", onTurnTick);
  bus.subscribe("hour", onHourTick);
  bus.subscribe("day", onDayTick);
  await catchUpMissedTime();
  const initialTravel = maybeStartTravel(world, rng, config.startWorldTime);
  for (const entry of initialTravel)
    await log(entry);
  await saveWorld(world);
  const turnMs = config.msPerWorldMinute * config.turnMinutes;
  const pad = (s) => `║  ${s.padEnd(62)}║`;
  const activeStories = storyThreads.filter((s) => !s.resolved).length;
  const statsLine = `Settlements: ${world.settlements.length}   Parties: ${world.parties.length}   Antagonists: ${antagonists.length}`;
  process.stdout.write(`
╔${"═".repeat(64)}╗
` + pad("BECMI Real-Time Simulator") + `
` + pad(formatDate(calendar)) + `
` + `╠${"═".repeat(64)}╣
` + pad(`Seed: ${config.seed}`) + `
` + pad(`Time Scale: ${config.timeScale}x (turn every ${turnMs}ms)`) + `
` + pad(statsLine) + `
` + pad(`Active Stories: ${activeStories}`) + `
` + `╚${"═".repeat(64)}╝

`);
  const scheduler = new Scheduler(bus, config);
  scheduler.start();
}
main();
