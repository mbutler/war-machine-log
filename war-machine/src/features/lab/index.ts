import { registerRoute } from "../../router";
import { renderLabPanel } from "./view";
import "./lab.css";

registerRoute({
  id: "lab",
  label: "Lab",
  description: "Research & crafting",
  section: "3. Domain & War",
  order: 4,
  mount(target) {
    return renderLabPanel(target);
  },
});

