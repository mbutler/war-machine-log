import { registerRoute } from "../../router";
import { renderDominionPanel } from "./view";
import "./dominion.css";

registerRoute({
  id: "dominion",
  label: "Dominion Administrator",
  description: "Seasonal domain management",
  section: "Domain",
  order: 1,
  mount(target) {
    return renderDominionPanel(target);
  },
});

