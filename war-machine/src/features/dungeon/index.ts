import { registerRoute } from "../../router";
import { renderDungeonPanel } from "./view";
import "./dungeon.css";

registerRoute({
  id: "dungeon",
  label: "Dungeon",
  description: "Tactical combat + loot tracking",
  section: "1. Adventure",
  order: 3,
  mount(target) {
    return renderDungeonPanel(target);
  },
});

