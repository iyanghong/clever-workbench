/** Shared manual-open check; each caller still owns its request cancellation and dialog state. */
export async function manualGuidanceAvailability(messages: {
  busy: string;
  modal: string;
  unavailable: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const availability = await window.desktop.guidanceAvailability();
    if (!availability.available)
      return { ok: false, message: availability.reason ?? messages.busy };
    if (document.querySelector('dialog[open], [role="alertdialog"]'))
      return { ok: false, message: messages.modal };
    return { ok: true };
  } catch {
    return { ok: false, message: messages.unavailable };
  }
}
