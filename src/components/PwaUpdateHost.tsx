import * as React from "react";
import { setupPwaUpdate } from "../lib/pwaUpdate";

export function PwaUpdateHost() {
  React.useEffect(() => setupPwaUpdate(() => undefined), []);
  return null;
}
