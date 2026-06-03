import * as React from "react";
import type { Customer } from "../lib/types";

export function useSaleCustomerSource(activeCustomers: Customer[]) {
  const [presetId, setPresetId] = React.useState("");
  const [custom, setCustom] = React.useState("");

  React.useEffect(() => {
    if (!presetId) return;
    if (activeCustomers.some((customer) => String(customer.id) === presetId)) return;
    setPresetId("");
  }, [activeCustomers, presetId]);

  React.useEffect(() => {
    if (custom.length > 0 && presetId) {
      setPresetId("");
    }
  }, [custom, presetId]);

  const presetName = activeCustomers.find((customer) => String(customer.id) === presetId)?.name ?? "";
  const customerName = custom.trim() || presetName;
  const hasPreset = Boolean(presetId);
  const hasCustom = custom.length > 0;

  const reset = React.useCallback(() => {
    setPresetId("");
    setCustom("");
  }, []);

  return {
    presetId,
    setPresetId,
    custom,
    setCustom,
    customerName,
    hasPreset,
    hasCustom,
    reset
  };
}
