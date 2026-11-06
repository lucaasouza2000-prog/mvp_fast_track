"use client";

import { createContext, useContext } from "react";

// This context only renders empty interfaces. Database access remains subject
// to Auth/RLS, and the preview never creates a Supabase client or session.
export const InterfacesPreviewContext = createContext(false);
export function useInterfacesPreview() {
  return useContext(InterfacesPreviewContext);
}
