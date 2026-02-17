import { RETAINER_TYPES, type RetainerTypeDefinition, type RetainerCategory } from "./retainers";

const CATEGORY_LABELS: Record<RetainerCategory, string> = {
  hirelings: "Hirelings",
  mercenaries: "Mercenaries",
  specialists: "Specialists",
};

const CATEGORY_ORDER: RetainerCategory[] = ["hirelings", "mercenaries", "specialists"];

export interface RetainerPickerOptions {
  onSelect: (type: RetainerTypeDefinition) => void;
}

export function createRetainerPicker(options: RetainerPickerOptions): HTMLElement {
  const container = document.createElement("div");
  container.className = "retainer-picker";

  // Group by category
  const grouped = new Map<RetainerCategory, RetainerTypeDefinition[]>();
  RETAINER_TYPES.forEach((type) => {
    const list = grouped.get(type.category) ?? [];
    list.push(type);
    grouped.set(type.category, list);
  });

  CATEGORY_ORDER.forEach((category) => {
    const types = grouped.get(category);
    if (!types || types.length === 0) return;

    const sectionLabel = document.createElement("div");
    sectionLabel.className = "retainer-section";
    sectionLabel.textContent = CATEGORY_LABELS[category];
    container.appendChild(sectionLabel);

    types.forEach((type) => {
      container.appendChild(createRetainerOption(type, options.onSelect));
    });
  });

  return container;
}

function createRetainerOption(
  type: RetainerTypeDefinition,
  onSelect: (type: RetainerTypeDefinition) => void,
): HTMLElement {
  const option = document.createElement("button");
  option.type = "button";
  option.className = "retainer-option";

  const header = document.createElement("div");
  header.className = "retainer-option-header";

  const name = document.createElement("span");
  name.className = "retainer-option-name";
  name.textContent = type.label;
  header.appendChild(name);

  const wage = document.createElement("span");
  wage.className = "retainer-option-wage";
  wage.textContent = type.wageNote
    ? `${type.wage} gp/${type.wageNote.replace("per ", "")}`
    : `${type.wage} gp/mo`;
  header.appendChild(wage);

  const desc = document.createElement("div");
  desc.className = "retainer-option-desc";
  desc.textContent = type.description;

  const stats = document.createElement("div");
  stats.className = "retainer-option-stats";

  const statItems = [
    { label: "AC", value: type.ac },
    { label: "THAC0", value: type.thac0 },
    { label: "HD", value: `d${type.hd}${type.hpBonus > 0 ? `+${type.hpBonus}` : ""}` },
  ];

  statItems.forEach(({ label, value }) => {
    const stat = document.createElement("span");
    stat.className = "retainer-stat";
    stat.innerHTML = `<strong>${label}</strong>${value}`;
    stats.appendChild(stat);
  });

  option.append(header, desc, stats);

  option.addEventListener("click", () => {
    onSelect(type);
  });

  return option;
}

