import type { Customer } from "../lib/types";
import { fieldControlClass } from "../lib/formStyles";
import { CustomerManageButton } from "./CustomerManagerModal";
import { Input } from "./ui/input";
import { Select } from "./ui/select";

const fieldSelectClass = fieldControlClass;
const fieldInputClass = fieldControlClass;
const sectionBoxClass = "min-w-0 space-y-2.5 rounded-lg border bg-muted/20 p-3 sm:space-y-3 sm:p-4";
const sectionTitleClass = "text-base font-semibold leading-tight sm:text-[1.1375rem]";

type SaleCustomerFieldsProps = {
  activeCustomers: Customer[];
  presetId: string;
  customName: string;
  hasPreset: boolean;
  hasCustom: boolean;
  onPresetIdChange: (id: string) => void;
  onCustomNameChange: (name: string) => void;
  onManageClick: () => void;
  onClearError?: () => void;
};

export function SaleCustomerFields({
  activeCustomers,
  presetId,
  customName,
  hasPreset,
  hasCustom,
  onPresetIdChange,
  onCustomNameChange,
  onManageClick,
  onClearError
}: SaleCustomerFieldsProps) {
  const clearError = () => onClearError?.();

  return (
    <div className={sectionBoxClass}>
      <div className="flex min-w-0 items-center justify-between gap-2">
        <p className={sectionTitleClass}>客戶選擇</p>
        <CustomerManageButton onClick={onManageClick} />
      </div>
      <div className="grid min-w-0 grid-cols-2 gap-2 sm:gap-3 max-[440px]:grid-cols-1">
        <label className="flex min-w-0 items-center gap-2 text-sm font-medium">
          <span className="w-7 shrink-0">常用</span>
          <Select
            className={fieldSelectClass}
            value={hasCustom ? "" : presetId}
            disabled={hasCustom}
            onChange={(event) => {
              if (hasCustom) return;
              const nextPresetId = event.target.value;
              onPresetIdChange(nextPresetId);
              if (nextPresetId) onCustomNameChange("");
              clearError();
            }}
          >
            <option value="">不選擇</option>
            {activeCustomers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex min-w-0 items-center gap-2 text-sm font-medium">
          <span className="w-7 shrink-0">其他</span>
          <Input
            className={fieldInputClass}
            value={customName}
            disabled={hasPreset}
            onChange={(event) => {
              const nextCustom = event.target.value;
              onCustomNameChange(nextCustom);
              if (nextCustom.length > 0) onPresetIdChange("");
              clearError();
            }}
          />
        </label>
      </div>
    </div>
  );
}
