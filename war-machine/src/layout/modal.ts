export interface ModalOptions {
  title: string;
  content: HTMLElement;
  onClose?: () => void;
}

let activeModal: HTMLElement | null = null;

function closeActiveModal() {
  if (activeModal && activeModal.parentElement) {
    activeModal.classList.add("modal-closing");
    setTimeout(() => {
      activeModal?.parentElement?.removeChild(activeModal);
      activeModal = null;
    }, 150);
  }
}

export function showModal(options: ModalOptions): () => void {
  closeActiveModal();

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";

  const dialog = document.createElement("div");
  dialog.className = "modal-dialog";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-labelledby", "modal-title");

  const header = document.createElement("div");
  header.className = "modal-header";

  const title = document.createElement("h2");
  title.id = "modal-title";
  title.className = "modal-title";
  title.textContent = options.title;
  header.appendChild(title);

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "modal-close";
  closeBtn.textContent = "×";
  closeBtn.setAttribute("aria-label", "Close");
  header.appendChild(closeBtn);

  const body = document.createElement("div");
  body.className = "modal-body";
  body.appendChild(options.content);

  dialog.append(header, body);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  activeModal = overlay;

  // Animate in
  requestAnimationFrame(() => {
    overlay.classList.add("modal-visible");
  });

  const close = () => {
    closeActiveModal();
    options.onClose?.();
  };

  closeBtn.addEventListener("click", close);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });

  // Escape key
  const handleEscape = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      close();
      document.removeEventListener("keydown", handleEscape);
    }
  };
  document.addEventListener("keydown", handleEscape);

  return close;
}

export function closeModal() {
  closeActiveModal();
}

