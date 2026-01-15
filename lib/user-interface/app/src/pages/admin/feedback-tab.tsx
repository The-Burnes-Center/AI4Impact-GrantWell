import { Table, Pagination, Button, Modal, Card, Form } from "react-bootstrap";
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { ApiClient } from "../../common/api-client/api-client";
import { AppContext } from "../../common/app-context";
import { getColumnDefinition } from "./columns";
import { Utils } from "../../common/utils";
import React from 'react';
import { useNotifications } from "../../components/notif-manager";
import { feedbackCategories } from '../../common/constants';
import "bootstrap/dist/css/bootstrap.min.css";

export interface FeedbackTabProps {
  updateSelectedFeedback: React.Dispatch<any>;
}

export default function FeedbackTab(props: FeedbackTabProps) {
  const appContext = useContext(AppContext);
  const apiClient = new ApiClient(appContext);
  const [loading, setLoading] = useState(true);
  const [currentPageIndex, setCurrentPageIndex] = useState(1);
  const [pages, setPages] = useState<any[]>([]);
  const [selectedItems, setSelectedItems] = useState<any[]>([]);
  const [showModalDelete, setShowModalDelete] = useState(false);
  const needsRefresh = useRef<boolean>(false);

  const [
    selectedOption,
    setSelectedOption
  ] = React.useState({ label: "Any", value: "any" });
  const [startDate, setStartDate] = React.useState<string>(
    (new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate() - 1)).toISOString().split("T")[0]
  );
  const [endDate, setEndDate] = React.useState<string>(
    (new Date()).toISOString().split("T")[0]
  );

  const { addNotification, removeNotification } = useNotifications();

  // Sort items by FeedbackID descending by default
  const currentPageItems = pages[Math.min(pages.length - 1, currentPageIndex - 1)]?.Items || [];
  const sortedItems = [...currentPageItems].sort((a, b) => {
    if (a.FeedbackID < b.FeedbackID) return 1;
    if (a.FeedbackID > b.FeedbackID) return -1;
    return 0;
  });

  /** This is the memoized function that is used to get feedback. It takes in a
   * page index to set the data locally to the correct page as well as a token that the
   * API uses to paginate the results.
   */
  const getFeedback = useCallback(
    async (params: { pageIndex?, nextPageToken?}) => {
      setLoading(true);
      try {
        const result = await apiClient.userFeedback.getUserFeedback(selectedOption.value, startDate + "T00:00:00", endDate + "T23:59:59", params.nextPageToken)

        setPages((current) => {
          /** When any of the filters change, we want to reset the display back to page 1.
           * Therefore, when needsRefresh is true, we want to set the pages array so that whatever was just retrieved
           * is set as the first page
           */
          if (needsRefresh.current) {
            needsRefresh.current = false;
            return [result];
          }
          /** If there was a provided page index, then pop it in that index */
          if (typeof params.pageIndex !== "undefined") {
            current[params.pageIndex - 1] = result;
            return [...current];
          } else {
            /** Otherwise, not, and just append it to the end and hope it's correct */
            return [...current, result];
          }
        });
      } catch (error) {
        console.error(Utils.getErrorMessage(error));
      }
      setLoading(false);
    },
    [appContext, selectedOption, startDate, endDate, needsRefresh]
  );


  /** The getFeedback function is a memoized function.
   * When any of the filters change, getFeedback will also change and we therefore need a refresh
   */
  useEffect(() => {
    setCurrentPageIndex(1);
    setSelectedItems([]);
    if (needsRefresh.current) {
      getFeedback({ pageIndex: 1 });
    } else {
      getFeedback({ pageIndex: currentPageIndex });
    }
  }, [getFeedback]);

  /** Handles next page clicks */
  const onNextPageClick = async () => {
    const continuationToken = pages[currentPageIndex - 1]?.NextPageToken;
    if (continuationToken) {
      if (pages.length <= currentPageIndex || needsRefresh.current) {
        await getFeedback({ nextPageToken: continuationToken });
      }
      setCurrentPageIndex((current) => Math.min(pages.length + 1, current + 1));
    }
  };

  /** Handles previous page clicks */
  const onPreviousPageClick = async () => {
    setCurrentPageIndex((current) =>
      Math.max(1, Math.min(pages.length - 1, current - 1))
    );
  };

  /** Handles page refreshes */
  const refreshPage = async () => {
    if (currentPageIndex <= 1) {
      await getFeedback({ pageIndex: currentPageIndex });
    } else {
      const continuationToken = pages[currentPageIndex - 2]?.NextPageToken!;
      await getFeedback({ pageIndex: currentPageIndex, nextPageToken: continuationToken });
    }
  };


  const columnDefinitions = getColumnDefinition("feedback");

  /** Deletes all selected feedback */
  const deleteSelectedFeedback = async () => {
    if (!appContext) return;
    setLoading(true);
    setShowModalDelete(false);
    const apiClient = new ApiClient(appContext);
    await Promise.all(
      selectedItems.map((s) => apiClient.userFeedback.deleteFeedback(s.Topic, s.CreatedAt))
    );
    await getFeedback({ pageIndex: currentPageIndex });
    setSelectedItems([])
    setLoading(false);
  };

  const handleSelectItem = (item: any) => {
    if (selectedItems.some((i) => i.FeedbackID === item.FeedbackID)) {
      setSelectedItems([]);
      props.updateSelectedFeedback(null);
    } else {
      setSelectedItems([item]);
      props.updateSelectedFeedback(item);
    }
  };

  const isSelected = (item: any) => {
    return selectedItems.some((i) => i.FeedbackID === item.FeedbackID);
  };

  return (
    <>
      <Modal show={showModalDelete} onHide={() => setShowModalDelete(false)}>
        <Modal.Header closeButton>
          <Modal.Title>Delete feedback{selectedItems.length > 1 ? "s" : ""}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          Do you want to delete{" "}
          {selectedItems.length == 1
            ? `Feedback ${selectedItems[0].FeedbackID!}?`
            : `${selectedItems.length} Feedback?`}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowModalDelete(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={deleteSelectedFeedback}>
            Ok
          </Button>
        </Modal.Footer>
      </Modal>
      <Card>
        <Card.Header>
          <div className="d-flex justify-content-between align-items-center flex-wrap gap-2">
            <div>
              <h5 className="mb-0">Feedback</h5>
              <small className="text-muted">
                Please expect a delay for your changes to be reflected. Press the refresh button to see the latest changes.
              </small>
            </div>
            <div className="d-flex gap-2 flex-wrap">
              <Form.Group className="d-flex align-items-center gap-2">
                <Form.Label className="mb-0">Start Date:</Form.Label>
                <Form.Control
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    needsRefresh.current = true;
                    setStartDate(e.target.value);
                  }}
                  style={{ width: "auto" }}
                />
              </Form.Group>
              <Form.Group className="d-flex align-items-center gap-2">
                <Form.Label className="mb-0">End Date:</Form.Label>
                <Form.Control
                  type="date"
                  value={endDate}
                  onChange={(e) => {
                    needsRefresh.current = true;
                    setEndDate(e.target.value);
                  }}
                  style={{ width: "auto" }}
                />
              </Form.Group>
              <Form.Select
                value={selectedOption.value}
                onChange={(e) => {
                  needsRefresh.current = true;
                  const option = [...feedbackCategories, {label : "Any", value: "any", disabled: false}].find(
                    (opt) => opt.value === e.target.value
                  );
                  if (option) {
                    setSelectedOption({ label: option.label, value: option.value });
                  }
                }}
                style={{ width: "auto" }}
              >
                {[...feedbackCategories, {label : "Any", value: "any", disabled: false}].map((cat) => (
                  <option key={cat.value} value={cat.value}>
                    {cat.label}
                  </option>
                ))}
              </Form.Select>
              <Button variant="outline-secondary" onClick={refreshPage}>
                ↻ Refresh
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  apiClient.userFeedback.downloadFeedback(selectedOption.value, startDate, endDate);
                  const id = addNotification("success", "Your files have been downloaded.")
                  Utils.delay(3000).then(() => removeNotification(id));
                }}
              >
                Download
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
            </div>
          </div>
        </Card.Header>
        <Card.Body>
          {loading ? (
            <div className="text-center p-4">
              <div className="spinner-border" role="status">
                <span className="visually-hidden">Loading...</span>
              </div>
              <div className="mt-2">Loading Feedback</div>
            </div>
          ) : sortedItems.length === 0 ? (
            <div className="text-center p-4">No feedback available</div>
          ) : (
            <>
              <Table striped bordered hover responsive>
                <thead>
                  <tr>
                    <th style={{ width: "40px" }}></th>
                    {columnDefinitions.map((col) => (
                      <th key={col.id}>{col.header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedItems.map((item) => (
                    <tr
                      key={item.FeedbackID}
                      onClick={() => handleSelectItem(item)}
                      style={{ cursor: "pointer" }}
                      className={isSelected(item) ? "table-active" : ""}
                    >
                      <td>
                        <input
                          type="radio"
                          checked={isSelected(item)}
                          onChange={() => handleSelectItem(item)}
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
                      disabled={!pages[currentPageIndex - 1]?.NextPageToken}
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
