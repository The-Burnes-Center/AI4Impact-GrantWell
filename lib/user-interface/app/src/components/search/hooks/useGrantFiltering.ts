import { useState, useEffect, useMemo } from "react";
import { SearchDocument, PinnableGrant } from "../types";

interface UseGrantFilteringProps {
  documents: SearchDocument[];
  pinnedGrants: PinnableGrant[];
  searchTerm: string;
}

interface UseGrantFilteringReturn {
  filteredDocuments: SearchDocument[];
  filteredPinnedGrants: PinnableGrant[];
}

export function useGrantFiltering({
  documents,
  pinnedGrants,
  searchTerm,
}: UseGrantFilteringProps): UseGrantFilteringReturn {
  const filteredDocuments = useMemo(() => {
    return documents
      .filter((doc) =>
        doc.label.toLowerCase().includes(searchTerm.toLowerCase())
      )
      .sort((a, b) =>
        a.label.localeCompare(b.label, undefined, { sensitivity: "base" })
      );
  }, [documents, searchTerm]);

  const filteredPinnedGrants = useMemo(() => {
    return pinnedGrants
      .filter((grant) =>
        grant.name.toLowerCase().includes(searchTerm.toLowerCase())
      )
      .sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
      );
  }, [pinnedGrants, searchTerm]);

  return {
    filteredDocuments,
    filteredPinnedGrants,
  };
}

export default useGrantFiltering;
