import { Table, Pagination, Button, Modal, Spinner, Card } from "react-bootstrap";
import { useCallback, useContext, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AdminDataType } from "../../common/types";
import { ApiClient } from "../../common/api-client/api-client";
import { AppContext } from "../../common/app-context";
import { Utils } from "../../common/utils";
import { useNotifications } from "../../components/notif-manager";
import { Auth } from "aws-amplify";
import "bootstrap/dist/css/bootstrap.min.css";

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
  const { addNotification } = useNotifications();
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

  // Sort items by Key descending by default
  const sortedItems = [...pages.flat()].sort((a, b) => {
    if (a.Key < b.Key) return 1;
    if (a.Key > b.Key) return -1;
    return 0;
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

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedItems(sortedItems);
    } else {
      setSelectedItems([]);
    }
  };

  const handleSelectItem = (item: any, checked: boolean) => {
    if (checked) {
      setSelectedItems([...selectedItems, item]);
    } else {
      setSelectedItems(selectedItems.filter((i) => i.key !== item.key));
    }
  };

  const isSelected = (item: any) => {
    return selectedItems.some((i) => i.key === item.key);
  };

  return (
    <>
      <Modal show={showModalDelete} onHide={() => setShowModalDelete(false)}>
        <Modal.Header closeButton>
          <Modal.Title>Delete file{selectedItems.length > 1 ? "s" : ""}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          Do you want to delete{" "}
          {selectedItems.length == 1
            ? `file ${selectedItems[0].Key!}?`
            : `${selectedItems.length} files?`}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowModalDelete(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={deleteSelectedFiles}>
            Ok
          </Button>
        </Modal.Footer>
      </Modal>
      <Card>
        <Card.Header>
          <div className="d-flex justify-content-between align-items-center">
            <div>
              <h5 className="mb-0">Files</h5>
              <small className="text-muted">
                Please expect a delay for your changes to be reflected. Press the refresh button to see the latest changes.
              </small>
            </div>
            <div className="d-flex gap-2">
              <Button variant="outline-secondary" onClick={refreshPage}>
                ↻ Refresh
              </Button>
              <Button variant="outline-primary" onClick={props.tabChangeFunction}>
                Add Files
              </Button>
              <Button
                variant="danger"
                disabled={selectedItems.length == 0}
                onClick={() => {
                  if (selectedItems.length > 0) setShowModalDelete(true);
                }}
                data-testid="submit"
              >
                Delete
              </Button>
              <Button
                variant="primary"
                disabled={syncing}
                onClick={() => {
                  syncKendra();
                }}
              >
                {syncing ? (
                  <>
                    Syncing data...{" "}
                    <Spinner animation="border" size="sm" />
                  </>
                ) : (
                  "Sync data now"
                )}
              </Button>
            </div>
          </div>
        </Card.Header>
        <Card.Body>
          {loading ? (
            <div className="text-center p-4">
              <Spinner animation="border" />
              <div className="mt-2">Loading files</div>
            </div>
          ) : sortedItems.length === 0 ? (
            <div className="text-center p-4">No files available</div>
          ) : (
            <>
              <Table striped bordered hover responsive>
                <thead>
                  <tr>
                    <th style={{ width: "40px" }}>
                      <input
                        type="checkbox"
                        checked={selectedItems.length === sortedItems.length && sortedItems.length > 0}
                        onChange={handleSelectAll}
                      />
                    </th>
                    {columnDefinitions.map((col) => (
                      <th key={col.id}>{col.header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedItems.map((item) => (
                    <tr key={item.key}>
                      <td>
                        <input
                          type="checkbox"
                          checked={isSelected(item)}
                          onChange={(e) => handleSelectItem(item, e.target.checked)}
                        />
                      </td>
                      {columnDefinitions.map((col) => (
                        <td key={col.id}>{col.cell(item)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </Table>
              {pages.length > 0 && (
                <div className="d-flex justify-content-center mt-3">
                  <Pagination>
                    <Pagination.Prev
                      disabled={currentPageIndex === 1}
                      onClick={onPreviousPageClick}
                    />
                    <Pagination.Item active>{currentPageIndex}</Pagination.Item>
                    <Pagination.Next
                      disabled={!pages[currentPageIndex - 1]?.NextContinuationToken}
                      onClick={onNextPageClick}
                    />
                  </Pagination>
                </div>
              )}
            </>
          )}
        </Card.Body>
      </Card>
    </>
  );
}
