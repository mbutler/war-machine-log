import { registerRoute } from "../../router";
import { renderDominionPanel } from "./view";
import "./dominion.css";

registerRoute({
  id: "dominion",
  label: "Dominion",
  description: "Seasonal domain management",
  section: "3. Domain & War",
  order: 1,
  mount(target) {
    return renderDominionPanel(target);
  },
});

