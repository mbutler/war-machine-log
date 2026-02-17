import { registerRoute } from "../../router";
import { renderSiegePanel } from "./view";
import "./siege.css";

registerRoute({
  id: "siege",
  label: "Siege",
  description: "Battle ratings & siege ops",
  section: "3. Domain & War",
  order: 3,
  mount(target) {
    return renderSiegePanel(target);
  },
});

