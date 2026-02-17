import { registerRoute } from "../../router";
import { renderMerchantPanel } from "./view";

registerRoute({
  id: "merchant",
  label: "Merchant",
  description: "Trade, tariffs, caravans",
  section: "2. Campaign",
  order: 4,
  mount(target) {
    return renderMerchantPanel(target);
  },
});

