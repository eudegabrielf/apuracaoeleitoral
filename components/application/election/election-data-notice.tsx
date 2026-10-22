import { RiErrorWarningLine } from "@remixicon/react";

export function ElectionDataNotice({
  message,
  detail,
}: {
  message: string;
  detail: string;
}) {
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-2xl border border-border-button-default bg-background-secondary-default p-4 sm:p-5"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-background-primary-default text-text-primary">
        <RiErrorWarningLine className="size-5" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="text-body-medium text-text-primary">Dados oficiais do TSE indisponíveis</p>
        <p className="mt-1 text-body-2-regular text-text-secondary">{message}</p>
        <p className="mt-2 text-caption-1-regular text-text-tertiary">{detail}</p>
      </div>
    </div>
  );
}
