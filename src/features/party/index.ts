import { registerRoute } from "../../router";
import { renderPartyPanel } from "./view";
import "./party.css";

registerRoute({
  id: "party",
  label: "Party",
  description: "Character generator & roster",
  section: "1. Adventure",
  order: 1,
  mount(target) {
    return renderPartyPanel(target);
  },
});

