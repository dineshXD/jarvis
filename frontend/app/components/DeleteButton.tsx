/**
 * DeleteButton.tsx — Shared Delete Button with Toast Notifications
 */
"use client";

import { useState } from "react";
import { deleteUrlAction } from "../actions";
import { useToast } from "../lib/toast-context";

interface DeleteButtonProps {
  url: string;
}

export function DeleteButton({ url }: DeleteButtonProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const { toast } = useToast();

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();

    if (!window.confirm("Remove this entry from your vault?")) {
      return;
    }

    setIsDeleting(true);
    const result = await deleteUrlAction(url);

    if (result.success) {
      toast.success("Entry removed from vault");
    } else {
      toast.error(result.message);
      setIsDeleting(false);
    }
  }

  return (
    <button
      className="entry-delete"
      title="Delete"
      onClick={handleDelete}
      disabled={isDeleting}
      aria-label="Delete entry"
    >
      {isDeleting ? "…" : "×"}
    </button>
  );
}
