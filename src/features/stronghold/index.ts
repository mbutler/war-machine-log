import { registerRoute } from "../../router";
import { renderStrongholdPanel } from "./view";
import "./stronghold.css";

registerRoute({
  id: "stronghold",
  label: "Stronghold",
  description: "Construction estimates",
  section: "3. Domain & War",
  order: 2,
  mount(target) {
    return renderStrongholdPanel(target);
  },
});

