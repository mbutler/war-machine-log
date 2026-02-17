import { registerRoute } from "../../router";
import { renderTreasurePanel } from "./view";
import "./treasure.css";

registerRoute({
  id: "treasure",
  label: "Treasure",
  description: "Hoard tables & valuables",
  section: "2. Campaign",
  order: 3,
  mount(target) {
    return renderTreasurePanel(target);
  },
});

