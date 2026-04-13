"use server";

import { redirect } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";

import {
  approveCurrentWorkspaceApprovalRequest,
  editAndApproveCurrentWorkspaceApprovalRequest,
  rejectCurrentWorkspaceApprovalRequest,
  reviseRejectedCurrentWorkspaceApprovalRequest,
} from "@/lib/approval-queue";

function buildApprovalDetailRedirect(
  approvalRequestId: string,
  params?: Record<string, string>,
) {
  const searchParams = new URLSearchParams(params);
  const suffix = searchParams.toString();

  return suffix
    ? `/approvals/${approvalRequestId}?${suffix}`
    : `/approvals/${approvalRequestId}`;
}

function readApprovalRequestId(formData: FormData) {
  return String(formData.get("approvalRequestId") ?? "").trim();
}

export async function approveApprovalRequestAction(formData: FormData) {
  const approvalRequestId = readApprovalRequestId(formData);

  if (!approvalRequestId) {
    redirect("/approvals");
  }

  try {
    const result = await approveCurrentWorkspaceApprovalRequest({
      approvalRequestId,
    });

    if (result.send?.sendStatus === "FAILED") {
      redirect(
        buildApprovalDetailRedirect(approvalRequestId, {
          review: "send-failed",
          message: "Draft was approved, but provider send failed.",
        }),
      );
    }

    redirect(
      buildApprovalDetailRedirect(approvalRequestId, {
        review: "approved",
      }),
    );
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }

    redirect(
      buildApprovalDetailRedirect(approvalRequestId, {
        review: "error",
        message:
          error instanceof Error ? error.message : "Unable to approve the draft.",
      }),
    );
  }
}

export async function rejectApprovalRequestAction(formData: FormData) {
  const approvalRequestId = readApprovalRequestId(formData);
  const rejectionReason = String(formData.get("rejectionReason") ?? "").trim();

  if (!approvalRequestId) {
    redirect("/approvals");
  }

  if (!rejectionReason) {
    redirect(
      buildApprovalDetailRedirect(approvalRequestId, {
        review: "error",
        message: "Rejection reason is required.",
      }),
    );
  }

  try {
    await rejectCurrentWorkspaceApprovalRequest({
      approvalRequestId,
      rejectionReason,
    });

    redirect(
      buildApprovalDetailRedirect(approvalRequestId, {
        review: "rejected",
      }),
    );
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }

    redirect(
      buildApprovalDetailRedirect(approvalRequestId, {
        review: "error",
        message:
          error instanceof Error ? error.message : "Unable to reject the draft.",
      }),
    );
  }
}

export async function editAndApproveApprovalRequestAction(formData: FormData) {
  const approvalRequestId = readApprovalRequestId(formData);
  const editedContent = String(formData.get("editedContent") ?? "").trim();

  if (!approvalRequestId) {
    redirect("/approvals");
  }

  if (!editedContent) {
    redirect(
      buildApprovalDetailRedirect(approvalRequestId, {
        review: "error",
        message: "Edited draft content is required.",
      }),
    );
  }

  try {
    const result = await editAndApproveCurrentWorkspaceApprovalRequest({
      approvalRequestId,
      editedContent,
    });

    if (result.send?.sendStatus === "FAILED") {
      redirect(
        buildApprovalDetailRedirect(approvalRequestId, {
          review: "send-failed",
          message:
            "Draft was edited and approved, but provider send failed.",
        }),
      );
    }

    redirect(
      buildApprovalDetailRedirect(approvalRequestId, {
        review: "edit-approved",
      }),
    );
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }

    redirect(
      buildApprovalDetailRedirect(approvalRequestId, {
        review: "error",
        message:
          error instanceof Error
            ? error.message
            : "Unable to edit and approve the draft.",
      }),
    );
  }
}

export async function reviseRejectedApprovalRequestAction(formData: FormData) {
  const approvalRequestId = readApprovalRequestId(formData);
  const revisedContent = String(formData.get("revisedContent") ?? "").trim();

  if (!approvalRequestId) {
    redirect("/approvals");
  }

  if (!revisedContent) {
    redirect(
      buildApprovalDetailRedirect(approvalRequestId, {
        review: "error",
        message: "Revised draft content is required.",
      }),
    );
  }

  try {
    const result = await reviseRejectedCurrentWorkspaceApprovalRequest({
      approvalRequestId,
      revisedContent,
    });

    redirect(
      buildApprovalDetailRedirect(result.approvalRequestId, {
        review: "revised",
      }),
    );
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }

    redirect(
      buildApprovalDetailRedirect(approvalRequestId, {
        review: "error",
        message:
          error instanceof Error
            ? error.message
            : "Unable to create a revised approval draft.",
      }),
    );
  }
}
