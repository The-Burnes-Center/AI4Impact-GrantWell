import {
  Box,
  SpaceBetween,
  Table,
  Pagination,
  Button,
  Header,
  Modal,
  Spinner,
} from "@cloudscape-design/components";
import { useCallback, useContext, useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { AdminDataType } from "../../common/types";
import { ApiClient } from "../../common/api-client/api-client";
import { AppContext } from "../../common/app-context";
import { getColumnDefinition } from "./columns";
import { Utils } from "../../common/utils";
import { useCollection } from "@cloudscape-design/collection-hooks";
import { useNotifications } from "../../components/notif-manager";
import { Auth } from "aws-amplify";

export interface DocumentsTabProps {
  tabChangeFunction: () => void;
  documentType: AdminDataType;
  statusRefreshFunction: () => void;
  lastSyncTime: string;
  setShowUnsyncedAlert: React.Dispatch<React.SetStateAction<boolean>>;
}

export default function DocumentsTab(props: DocumentsTabProps) {
  const appContext = useContext(AppContext);
  const apiClient = new ApiClient(appContext);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [currentPageIndex, setCurrentPageIndex] = useState(1);
  const [pages, setPages] = useState<any[]>([]);
  const [selectedItems, setSelectedItems] = useState<any[]>([]);
  const [showModalDelete, setShowModalDelete] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const { addNotification, removeNotification } = useNotifications();
  // const documentIdentifier = new URLSearchParams(location.search).get("folder");
  //const { documentIdentifier } = useParams();
  const [searchParams] = useSearchParams();
  const documentIdentifier = searchParams.get("folder");

  // Helper to extract NOFO name from documentIdentifier
  const extractNofoName = (docId: string | null): string => {
    if (!docId) return "";
    return docId.split("/").pop() || docId;
  };

  // Get userId on mount
  useEffect(() => {
    const fetchUserId = async () => {
      try {
        const user = await Auth.currentAuthenticatedUser();
        setUserId(user.username);
      } catch (error) {
        console.error("Error getting user:", error);
      }
    };
    fetchUserId();
  }, []);

  /** Pagination, but this is currently not working.
   * You will likely need to take the items object from useCollection in the
   * Cloudscape component, but it currently just takes in pages directly.
   */
  const { items, collectionProps, paginationProps } = useCollection(pages.flat(), {
    filtering: {
      empty: (
        <Box margin={{ vertical: "xs" }} textAlign="center" color="inherit">
          <SpaceBetween size="m">
            <b>No files</b>
          </SpaceBetween>
        </Box>
      ),
    },
    pagination: { pageSize: 5 },
    sorting: {
      defaultState: {
        sortingColumn: {
          sortingField: "Key",
        },
        isDescending: true,
      },
    },
    selection: {},
  });

  useEffect(() => {
    // Function to parse the lastSyncTime
    const parseLastSyncTime = (timeString: string) => {
      try {
        const dateParts = timeString.split(', ');
        const datePart = dateParts.slice(0, 2).join(', ');
        const timePart = dateParts.slice(2).join(', ');
      
        const [month, day, year] = datePart.split(' ');
        const [time, period] = timePart.split(' ');
        const [hours, minutes] = time.split(':');
      
        const date = new Date(Date.UTC(
          parseInt(year),
          new Date(Date.parse(month + " 1, " + year)).getUTCMonth(),
          parseInt(day),
          parseInt(hours),
          parseInt(minutes)
        ));
      
        if (period.toLowerCase() === 'pm' && parseInt(hours) !== 12) {
          date.setUTCHours(date.getUTCHours() + 12);
        } else if (period.toLowerCase() === 'am' && parseInt(hours) === 12) {
          date.setUTCHours(0);
        }
      
        return date;
      } catch (error) {
        return new Date();
      }
    };

    const lastSyncDate = parseLastSyncTime(props.lastSyncTime);

    // Check if any files have a LastModified date newer than the lastSyncTime
    const hasUnsyncedFiles = pages.some((page) =>
      page.Contents?.some((file) => {
        const fileDate = new Date(file.LastModified);
        return fileDate > lastSyncDate;
      })
    );

    props.setShowUnsyncedAlert(hasUnsyncedFiles);
  }, [pages, props.lastSyncTime, props.setShowUnsyncedAlert]);

  const getDocuments = useCallback(
    async (params: { folderPrefix?: string, continuationToken?: string; pageIndex?: number }) => {
      if (!userId || !documentIdentifier) return;
      setLoading(true);
      try {
        const nofoName = extractNofoName(documentIdentifier);
        const result = await apiClient.knowledgeManagement.getDocuments(userId, nofoName, params.continuationToken, params.pageIndex);
        await props.statusRefreshFunction();
  
        // Map over result.Contents instead of result.CommonPrefixes
        const documents = result.Contents.map((doc, index) => ({
          Key: doc.Key,
          key: doc.Key,
          LastModified: doc.LastModified,
          Size: doc.Size,
          ETag: doc.ETag,
          StorageClass: doc.StorageClass,
        }));
  
        // Replace the `pages` instead of appending to avoid duplicates
        setPages([documents]);
      } catch (error) {
        console.error(Utils.getErrorMessage(error));
      }
  
      setLoading(false);
    },
    [appContext, props.documentType, documentIdentifier, userId]
  );
  
  

  /** Whenever the memoized function changes, call it again */
  useEffect(() => {
    getDocuments({});
  }, [getDocuments, documentIdentifier]);

  /** Handle clicks on the next page button, as well as retrievals of new pages if needed*/
  const onNextPageClick = async () => {
    const continuationToken = pages[currentPageIndex - 1]?.NextContinuationToken;

    if (continuationToken) {
      if (pages.length <= currentPageIndex) {
        await getDocuments({ folderPrefix: documentIdentifier, continuationToken });
      }
      setCurrentPageIndex((current) => Math.min(pages.length + 1, current + 1));
    }
  };

  /** Handle clicks on the previous page button */
  const onPreviousPageClick = async () => {
    setCurrentPageIndex((current) =>
      Math.max(1, Math.min(pages.length - 1, current - 1))
    );
  };

  /** Handle refreshes */
  const refreshPage = async () => {
    if (currentPageIndex <= 1) {
      await getDocuments({ folderPrefix: documentIdentifier, pageIndex: currentPageIndex });
    } else {
      const continuationToken = pages[currentPageIndex - 2]?.NextContinuationToken!;
      await getDocuments({ folderPrefix: documentIdentifier, continuationToken });
    }
  };

 const columnDefinitions = [
    {
      id: "key",
      header: "Name",
      cell: (item) => item.Key,
      isRowHeader: true,
    },
    {
      id: "lastModified",
      header: "Last Modified",
      cell: (item) => new Date(item.LastModified).toLocaleString(),
    },
  ];
  

  /** Deletes selected files */
  const deleteSelectedFiles = async () => {
    if (!appContext || !userId || !documentIdentifier) return;
    setLoading(true);
    setShowModalDelete(false);

    const apiClient = new ApiClient(appContext);
    const nofoName = extractNofoName(documentIdentifier);
    try {
      await Promise.all(
        selectedItems.map((s) => {
          // Extract filename from Key (format: userId/nofoName/filename)
          const fileName = s.Key!.split("/").pop() || s.Key!;
          return apiClient.knowledgeManagement.deleteFile(userId, nofoName, fileName);
        })
      );
    } catch (e) {
      addNotification("error", "Error deleting files")
      console.error(e);
    }
    // refresh the documents after deletion
    await getDocuments({ folderPrefix: documentIdentifier, pageIndex: currentPageIndex });

    setSelectedItems([])
    setLoading(false);
  };

  /** Start a 10-second interval on which to check sync status and disable the button if 
   * syncing is not completed
   */
  useEffect(() => {
    if (!appContext) return;
    const apiClient = new ApiClient(appContext);

    const getStatus = async () => {
      try {
        const result = await apiClient.knowledgeManagement.kendraIsSyncing();
        /** If the status is anything other than DONE SYNCING, then just
         * keep the button disabled as if a sync is still running
         */
        setSyncing(result != "DONE SYNCING");
      } catch (error) {
        addNotification("error", "Error checking sync status, please try again later.")
        console.error(error);
      }
    };

    const interval = setInterval(getStatus, 10000);
    getStatus();

    return () => clearInterval(interval);
  }, []);

  /** Function to run a sync */
  const syncKendra = async () => {
    if (syncing) {
      // setSyncing(false)
      return;
    }
    setSyncing(true);
    try {
      const state = await apiClient.knowledgeManagement.syncKendra();
      if (state != "STARTED SYNCING") {
        addNotification("error", "Error running sync, please try again later.")
        setSyncing(false)
      }
    } catch (error) {
      addNotification("error", "Error running sync, please try again later.")
      setSyncing(false)
    }
  }

  return (
    <><Modal
      onDismiss={() => setShowModalDelete(false)}
      visible={showModalDelete}
      footer={
        <Box float="right">
          <SpaceBetween direction="horizontal" size="xs">
            {" "}
            <Button variant="link" onClick={() => setShowModalDelete(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={deleteSelectedFiles}>
              Ok
            </Button>
          </SpaceBetween>{" "}
        </Box>
      }
      header={"Delete file" + (selectedItems.length > 1 ? "s" : "")}
    >
      Do you want to delete{" "}
      {selectedItems.length == 1
        ? `file ${selectedItems[0].Key!}?`
        : `${selectedItems.length} files?`}
    </Modal>
      <Table
        {...collectionProps}
        loading={loading}
        loadingText={`Loading files`}
        columnDefinitions={columnDefinitions}
        selectionType="multi"
        onSelectionChange={({ detail }) => {
          setSelectedItems(detail.selectedItems);
        }}
        selectedItems={selectedItems}
        items={pages.flat()}
        trackBy="key"
        header={
          <Header
            actions={
              <SpaceBetween direction="horizontal" size="xs">
                <Button iconName="refresh" onClick={refreshPage} />
                <Button
                  onClick={props.tabChangeFunction}
                >
                  {'Add Files'}
                </Button>
                <Button
                  variant="primary"
                  disabled={selectedItems.length == 0}
                  onClick={() => {
                    if (selectedItems.length > 0) setShowModalDelete(true);
                  }}
                  data-testid="submit">
                  Delete
                </Button>
                <Button
                  variant="primary"
                  disabled={syncing}
                  onClick={() => {
                    syncKendra();
                  }}
                // data-testid="submit"
                >
                  {syncing ? (
                    <>
                      Syncing data...&nbsp;&nbsp;
                      <Spinner />
                    </>
                  ) : (
                    "Sync data now"
                  )}
                </Button>
              </SpaceBetween>
            }
            description="Please expect a delay for your changes to be reflected. Press the refresh button to see the latest changes."
          >
            {"Files"}
          </Header>
        }
        empty={
          <Box textAlign="center">No files available</Box>
        }
        pagination={
          pages.length === 0 ? null : (
            <Pagination
              openEnd={true}
              pagesCount={pages.length}
              currentPageIndex={currentPageIndex}
              onNextPageClick={onNextPageClick}
              onPreviousPageClick={onPreviousPageClick}
            />
          )
        }
      />
    </>
  );
}
