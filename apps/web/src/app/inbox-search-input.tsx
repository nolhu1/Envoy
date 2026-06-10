"use client";

import { useRef, useState } from "react";

import { Input } from "@envoy/ui";

type InboxSearchInputProps = {
  defaultValue: string;
};

export function InboxSearchInput({ defaultValue }: InboxSearchInputProps) {
  const formRef = useRef<HTMLFormElement | null>(null);
  const debounceRef = useRef<number | null>(null);
  const [value, setValue] = useState(defaultValue);

  return (
    <div ref={(node) => {
      formRef.current = node?.closest("form") ?? null;
    }} className="space-y-1">
      <Input
        type="search"
        name="q"
        value={value}
        onChange={(event) => {
          const nextValue = event.target.value;
          setValue(nextValue);

          if (debounceRef.current) {
            window.clearTimeout(debounceRef.current);
          }

          debounceRef.current = window.setTimeout(() => {
            formRef.current?.requestSubmit();
          }, 450);
        }}
        placeholder="Subject, participant, or message text"
      />
      {value !== defaultValue ? (
        <p className="text-xs text-slate-500">Filtering...</p>
      ) : null}
    </div>
  );
}
