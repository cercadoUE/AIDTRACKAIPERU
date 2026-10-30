"use client";
import { PageHeader } from "@/components/ui";
import { DonationEditor, newDraft } from "@/components/donation-editor";
import * as React from "react";

export default function DonarFormulario() {
  const initial = React.useMemo(() => [newDraft({ confirmed: true })], []);
  return (
    <>
      <PageHeader title="Formulario de donación" subtitle="Selecciona categoría, producto y cantidad. Puedes agregar varios productos." />
      <DonationEditor initial={initial} channel="form" />
    </>
  );
}
