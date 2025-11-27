import { registerRoute } from "../../router";
import { renderWildernessPanel } from "./view";
import "./wilderness.css";

registerRoute({
  id: "wilderness",
  label: "Royal Cartographer",
  description: "BECMI hex exploration with foraging & water management",
  section: "Exploration",
  order: 1,
  mount(target) {
    return renderWildernessPanel(target);
  },
});

