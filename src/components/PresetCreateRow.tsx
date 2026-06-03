import * as React from "react";
import { Plus } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

type PresetCreateRowProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  emptyError: string;
  onCreate: (name: string) => void;
};

export function PresetCreateRow({ value, onChange, placeholder, emptyError, onCreate }: PresetCreateRowProps) {
  const [error, setError] = React.useState("");

  const submit = () => {
    const name = value.trim();
    if (!name) {
      setError(emptyError);
      return;
    }
    setError("");
    try {
      onCreate(name);
      onChange("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "新增失敗");
    }
  };

  return (
    <div className="space-y-1">
      <div className="flex items-stretch gap-2">
        <Input
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
            if (error) setError("");
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              submit();
            }
          }}
          placeholder={placeholder}
          className="min-h-10 min-w-0 flex-1"
        />
        <Button type="button" className="h-10 shrink-0 px-3" disabled={!value.trim()} onClick={submit}>
          <Plus className="h-4 w-4" />
          新增
        </Button>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
