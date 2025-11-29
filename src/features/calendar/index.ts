import { registerRoute } from "../../router";
import { renderCalendarPanel } from "./view";
import "./calendar.css";

registerRoute({
  id: "calendar",
  label: "Calendar",
  description: "Campaign calendar & events",
  section: "2. Campaign",
  order: 2,
  mount(target) {
    return renderCalendarPanel(target);
  },
});

