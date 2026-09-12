"use client";
import { useState, useEffect, useCallback, useMemo, Fragment } from "react";
import {
  CheckCircle2,
  Upload,
  X,
  Search,
  History,
  ArrowLeft,
  Filter,
  Play,
  Pause,
  BellRing,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useRef } from "react";
import AdminLayout from "../components/layout/AdminLayout";
import AudioPlayer from "../components/AudioPlayer";
import { useDispatch, useSelector } from "react-redux";
import {
  delegation_DoneData,
  delegationData,
} from "../redux/slice/delegationSlice";
import { insertDelegationDoneAndUpdate } from "../redux/api/delegationApi";
import { sendUrgentTaskNotification, sendTaskExtensionNotification } from "../services/whatsappService";
import { useMagicToast } from "../context/MagicToastContext";
import RenderDescription, { MediaViewer } from "../components/RenderDescription";
import { formatToISTDateTime, formatToISTDate, formatToISTDisplay, ensureISTISO, getNowISTISOString } from "../utils/timezoneUtils";

// Configuration object - Move all configurations here
const CONFIG = {
  APPS_SCRIPT_URL:
    "https://script.google.com/macros/s/AKfycbzXzqnKmbeXw3i6kySQcBOwxHQA7y8WBFfEe69MPbCR-jux0Zte7-TeSKi8P4CIFkhE/exec",
  DRIVE_FOLDER_ID: "1LPsmRqzqvp6b7aY9FS1NfiiK0LV03v03",
  SOURCE_SHEET_NAME: "DELEGATION",
  TARGET_SHEET_NAME: "DELEGATION DONE",
  PAGE_CONFIG: {
    title: "DELEGATION Tasks",
    historyTitle: "DELEGATION Task History",
    description: "Showing all pending tasks",
    historyDescription:
      "Read-only view of completed tasks with submission history",
  },
};

// Debounce hook for search optimization
function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

function DelegationDataPage() {
  const { showToast } = useMagicToast();
  const [uploadedImages, setUploadedImages] = useState({});
  const [accountData, setAccountData] = useState([]);
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [additionalData, setAdditionalData] = useState({});
  const [searchTerm, setSearchTerm] = useState("");
  const [error, setError] = useState(null);
  const [remarksData, setRemarksData] = useState({});
  const [historyData, setHistoryData] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [statusData, setStatusData] = useState({});
  const [nextTargetDate, setNextTargetDate] = useState({});
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [userRole, setUserRole] = useState("");
  const [username, setUsername] = useState("");
  const [dateFilter, setDateFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerMedia, setViewerMedia] = useState({ url: '', type: 'image' });

  const itemsPerPage = 50;
  const filterOptions = [
    { value: "all", label: "All Tasks" },
    { value: "overdue", label: "Overdue" },
    { value: "today", label: "Today" },
    { value: "upcoming", label: "Upcoming" },
  ];

  // Debounced search term for better performance
  const debouncedSearchTerm = useDebounce(searchTerm, 300);

  const { loading, delegation, delegation_done } = useSelector(
    (state) => state.delegation
  );
  const dispatch = useDispatch();

  useEffect(() => {
    dispatch(delegationData());
    dispatch(delegation_DoneData());
  }, [dispatch]);

  const formatDateTimeToDDMMYYYY = useCallback((date) => {
    return formatToISTDateTime(date);
  }, []);

  const formatDateToDDMMYYYY = useCallback((date) => {
    return formatToISTDate(date);
  }, []);

  useEffect(() => {
    const role = localStorage.getItem("role");
    const user = localStorage.getItem("user-name");
    setUserRole(role || "");
    setUsername(user || "");
  }, []);

  // Initialize remarksData from delegation tasks (e.g., to show rejection reasons)
  useEffect(() => {
    if (delegation && delegation.length > 0) {
      setRemarksData(prev => {
        const newRemarks = { ...prev };
        delegation.forEach(task => {
          if (task.remarks && !newRemarks[task.id]) {
            newRemarks[task.id] = task.remarks;
          }
        });
        return newRemarks;
      });
    }
  }, [delegation]);

  const parseGoogleSheetsDateTime = useCallback(
    (dateTimeStr) => {
      if (!dateTimeStr) return "";

      if (
        typeof dateTimeStr === "string" &&
        dateTimeStr.match(/^\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}:\d{1,2}:\d{1,2}$/)
      ) {
        const [datePart, timePart] = dateTimeStr.split(" ");
        const [day, month, year] = datePart.split("/");
        const [hours, minutes, seconds] = timePart.split(":");

        const paddedDay = day.padStart(2, "0");
        const paddedMonth = month.padStart(2, "0");
        const paddedHours = hours.padStart(2, "0");
        const paddedMinutes = minutes.padStart(2, "0");
        const paddedSeconds = seconds.padStart(2, "0");

        return `${paddedDay}/${paddedMonth}/${year} ${paddedHours}:${paddedMinutes}:${paddedSeconds}`;
      }

      if (
        typeof dateTimeStr === "string" &&
        dateTimeStr.match(/^\d{1,2}\/\d{1,2}\/\d{4}$/)
      ) {
        const parts = dateTimeStr.split("/");
        if (parts.length === 3) {
          const day = parts[0].padStart(2, "0");
          const month = parts[1].padStart(2, "0");
          const year = parts[2];
          return `${day}/${month}/${year} 00:00:00`;
        }
        return dateTimeStr + " 00:00:00";
      }

      if (typeof dateTimeStr === "string" && dateTimeStr.startsWith("Date(")) {
        const match = /Date\((\d+),(\d+),(\d+)\)/.exec(dateTimeStr);
        if (match) {
          const year = Number.parseInt(match[1], 10);
          const month = Number.parseInt(match[2], 10);
          const day = Number.parseInt(match[3], 10);
          return `${day.toString().padStart(2, "0")}/${(month + 1)
            .toString()
            .padStart(2, "0")}/${year} 00:00:00`;
        }
      }

      try {
        const date = new Date(dateTimeStr);
        if (!isNaN(date.getTime())) {
          if (dateTimeStr.includes(":") || dateTimeStr.includes("T")) {
            return formatDateTimeToDDMMYYYY(date);
          } else {
            return formatDateToDDMMYYYY(date) + " 00:00:00";
          }
        }
      } catch (error) {
        console.error("Error parsing datetime:", error);
      }

      if (
        typeof dateTimeStr === "string" &&
        dateTimeStr.includes("/") &&
        !dateTimeStr.includes(":")
      ) {
        return dateTimeStr + " 00:00:00";
      }

      return dateTimeStr;
    },
    [formatDateTimeToDDMMYYYY, formatDateToDDMMYYYY]
  );

  const formatDateTimeForDisplay = useCallback(
    (dateTimeStr) => {
      return formatToISTDisplay(dateTimeStr);
    },
    []
  );

  const parseDateFromDDMMYYYY = useCallback((dateStr) => {
    if (!dateStr || typeof dateStr !== "string") return null;

    const datePart = dateStr.split(" ")[0];
    const parts = datePart.split("/");
    if (parts.length !== 3) return null;
    return new Date(parts[2], parts[1] - 1, parts[0]);
  }, []);

  const resetFilters = useCallback(() => {
    setSearchTerm("");
    setStartDate("");
    setEndDate("");
    setDateFilter("all");
  }, []);



  const parseAnyDate = useCallback((dateVal) => {
    if (!dateVal) return null;
    if (dateVal instanceof Date) return isNaN(dateVal.getTime()) ? null : dateVal;
    
    if (typeof dateVal === "string") {
      const cleanStr = dateVal.trim();
      if (cleanStr.includes("/")) {
        const datePart = cleanStr.split(" ")[0];
        const parts = datePart.split("/");
        if (parts.length === 3) {
          const day = parseInt(parts[0], 10);
          const month = parseInt(parts[1], 10) - 1;
          const year = parseInt(parts[2], 10);
          const d = new Date(year, month, day);
          if (!isNaN(d.getTime())) return d;
        }
      }
    }
    
    const d = new Date(dateVal);
    return isNaN(d.getTime()) ? null : d;
  }, []);

  const filteredDelegationTasks = useMemo(() => {
    if (!delegation) return [];

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    return delegation.filter((task) => {
      const assignedUser = (task.name || task.assigned_person || "").toLowerCase();
      const givenByUser = (task.given_by || "").toLowerCase();
      const currentUsername = (username || "").toLowerCase();
      const currentUserRole = (userRole || "").toLowerCase();

      const userMatch =
        currentUserRole === "admin" ||
        assignedUser === currentUsername ||
        givenByUser === currentUsername;

      if (!userMatch) return false;

      const matchesSearch = debouncedSearchTerm
        ? Object.values(task).some(
          (value) =>
            value &&
            value
              .toString()
              .toLowerCase()
              .includes(debouncedSearchTerm.toLowerCase())
        )
        : true;

      const taskDateStr = (task.status === "extend" && task.next_extend_date)
        ? task.next_extend_date
        : (task.planned_date || task.task_start_date || task.date);
      
      const plannedDate = parseAnyDate(taskDateStr);

      let matchesDateFilter = true;
      if (dateFilter !== "all" && plannedDate) {
        plannedDate.setHours(0, 0, 0, 0);

        switch (dateFilter) {
          case "overdue":
            matchesDateFilter = plannedDate < today;
            break;
          case "today":
            if (task.status === "extend") {
              matchesDateFilter = plannedDate >= today;
            } else {
              matchesDateFilter = plannedDate.getTime() === today.getTime();
            }
            break;
          case "upcoming":
            if (task.status === "extend") {
              matchesDateFilter = false;
            } else {
              matchesDateFilter = plannedDate >= tomorrow;
            }
            break;
          default:
            matchesDateFilter = true;
        }
      }

      return matchesSearch && matchesDateFilter;
    }).map(task => {
      let timeStatus = "Upcoming";
      const taskDateStr = (task.status === "extend" && task.next_extend_date)
        ? task.next_extend_date
        : (task.planned_date || task.task_start_date || task.date);

      const pDate = parseAnyDate(taskDateStr);

      if (pDate) {
        pDate.setHours(0, 0, 0, 0);

        if (pDate < today) {
          timeStatus = "Overdue";
        } else if (pDate.getTime() === today.getTime() || (task.status === "extend" && pDate >= today)) {
          timeStatus = "Today";
        } else {
          timeStatus = "Upcoming";
        }
      }
      return { ...task, timeStatus };
    }).sort((a, b) => {
      const priority = { "Overdue": 0, "Today": 1, "Upcoming": 2 };
      return (priority[a.timeStatus] ?? 3) - (priority[b.timeStatus] ?? 3);
    });
  }, [delegation, debouncedSearchTerm, dateFilter, userRole, username, parseAnyDate]);

  const filteredHistoryData = useMemo(() => {
    if (!delegation_done) return [];

    return delegation_done
      .filter((item) => {
        const assignedUser = (item.name || item.assigned_person || "").toLowerCase();
        const givenByUser = (item.given_by || "").toLowerCase();
        const currentUsername = (username || "").toLowerCase();
        const currentUserRole = (userRole || "").toLowerCase();

        const userMatch =
          currentUserRole === "admin" ||
          assignedUser === currentUsername ||
          givenByUser === currentUsername;

        if (!userMatch) return false;

        const matchesSearch = debouncedSearchTerm
          ? Object.values(item).some(
            (value) =>
              value &&
              value
                .toString()
                .toLowerCase()
                .includes(debouncedSearchTerm.toLowerCase())
          )
          : true;

        let matchesDateRange = true;
        if (startDate || endDate) {
          const itemDate = item.created_at ? new Date(item.created_at) : null;

          if (!itemDate || isNaN(itemDate.getTime())) {
            return false;
          }

          if (startDate) {
            const startDateObj = new Date(startDate);
            startDateObj.setHours(0, 0, 0, 0);
            if (itemDate < startDateObj) matchesDateRange = false;
          }

          if (endDate) {
            const endDateObj = new Date(endDate);
            endDateObj.setHours(23, 59, 59, 999);
            if (itemDate > endDateObj) matchesDateRange = false;
          }
        }

        return matchesSearch && matchesDateRange;
      })
      .sort((a, b) => {
        const dateA = a.created_at ? new Date(a.created_at) : null;
        const dateB = b.created_at ? new Date(b.created_at) : null;

        if (!dateA && !dateB) return 0;
        if (!dateA) return 1;
        if (!dateB) return -1;

        return dateB.getTime() - dateA.getTime();
      });
  }, [
    delegation_done,
    debouncedSearchTerm,
    startDate,
    endDate,
    userRole,
    username,
  ]);

  const handlePageChange = useCallback((page) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [showHistory, debouncedSearchTerm, dateFilter, startDate, endDate]);

  const paginatedTasks = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return (showHistory ? filteredHistoryData : filteredDelegationTasks).slice(start, start + itemsPerPage);
  }, [showHistory, filteredHistoryData, filteredDelegationTasks, currentPage, itemsPerPage]);

  const totalPages = Math.ceil((showHistory ? filteredHistoryData : filteredDelegationTasks).length / itemsPerPage);

  const PaginationUI = () => {
    if (totalPages <= 1) return null;
    const currentTasks = showHistory ? filteredHistoryData : filteredDelegationTasks;
    return (
      <div className="flex items-center justify-between px-4 py-3 bg-white border-t border-gray-200 mt-4 rounded-xl shadow-sm">
        <div className="flex justify-between flex-1 sm:hidden">
          <button
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className="relative inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
          >
            Previous
          </button>
          <button
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="relative ml-3 inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
          >
            Next
          </button>
        </div>
        <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-gray-700 font-medium">
              Showing <span className="text-purple-600">{(currentPage - 1) * itemsPerPage + 1}</span> to <span className="text-purple-600">{Math.min(currentPage * itemsPerPage, currentTasks.length)}</span> of <span className="text-purple-600">{currentTasks.length}</span> results
            </p>
          </div>
          <div>
            <nav className="inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:opacity-50"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum;
                if (totalPages <= 5) pageNum = i + 1;
                else if (currentPage <= 3) pageNum = i + 1;
                else if (currentPage >= totalPages - 2) pageNum = totalPages - 4 + i;
                else pageNum = currentPage - 2 + i;

                return (
                  <button
                    key={pageNum}
                    onClick={() => handlePageChange(pageNum)}
                    className={`relative inline-flex items-center px-4 py-2 text-sm font-bold ${currentPage === pageNum ? 'z-10 bg-purple-600 text-white shadow-lg' : 'text-gray-900 ring-1 ring-inset ring-gray-300 hover:bg-gray-50'}`}
                  >
                    {pageNum}
                  </button>
                );
              })}
              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:opacity-50"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </nav>
          </div>
        </div>
      </div>
    );
  };

  const handleSelectItem = useCallback((id, isChecked) => {
    setSelectedItems((prev) => {
      const newSelected = new Set(prev);

      if (isChecked) {
        newSelected.add(id);
        setStatusData((prevStatus) => ({ ...prevStatus, [id]: "Done" }));
      } else {
        newSelected.delete(id);
        setAdditionalData((prevData) => {
          const newAdditionalData = { ...prevData };
          delete newAdditionalData[id];
          return newAdditionalData;
        });
        setRemarksData((prevRemarks) => {
          const newRemarksData = { ...prevRemarks };
          delete newRemarksData[id];
          return newRemarksData;
        });
        setStatusData((prevStatus) => {
          const newStatusData = { ...prevStatus };
          delete newStatusData[id];
          return newStatusData;
        });
        setNextTargetDate((prevDate) => {
          const newDateData = { ...prevDate };
          delete newDateData[id];
          return newDateData;
        });
      }

      return newSelected;
    });
  }, []);

  const handleCheckboxClick = useCallback(
    (e, id) => {
      e.stopPropagation();
      const isChecked = e.target.checked;
      handleSelectItem(id, isChecked);
    },
    [handleSelectItem]
  );

  const handleSelectAllItems = useCallback(
    (e) => {
      e.stopPropagation();
      const checked = e.target.checked;
      
      const selectableIds = paginatedTasks
        .filter(item => item.timeStatus !== "Upcoming")
        .map((item) => item.id);

      if (checked) {
        // SELECT ALL on current page
        setSelectedItems((prev) => {
          const next = new Set(prev);
          selectableIds.forEach(id => {
            next.add(id);
            setStatusData((prevStatus) => ({ ...prevStatus, [id]: "Done" }));
          });
          return next;
        });
      } else {
        // UNSELECT ALL on current page
        setSelectedItems((prev) => {
          const next = new Set(prev);
          selectableIds.forEach(id => {
            next.delete(id);
            // Optionally clear associated data for these specific IDs
            setAdditionalData((prevData) => {
              const nextData = { ...prevData };
              delete nextData[id];
              return nextData;
            });
            setRemarksData((prevRemarks) => {
              const nextRemarks = { ...prevRemarks };
              delete nextRemarks[id];
              return nextRemarks;
            });
            setStatusData((prevStatus) => {
              const nextStatus = { ...prevStatus };
              delete nextStatus[id];
              return nextStatus;
            });
            setNextTargetDate((prevDate) => {
              const nextDates = { ...prevDate };
              delete nextDates[id];
              return nextDates;
            });
          });
          return next;
        });
      }
    },
    [paginatedTasks]
  );

  const handleImageUpload = useCallback((id, e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploadedImages((prev) => ({
      ...prev,
      [id]: file,
    }));
  }, []);

  const handleStatusChange = useCallback((id, value) => {
    setStatusData((prev) => ({ ...prev, [id]: value }));
    if (value === "Done") {
      setNextTargetDate((prev) => {
        const newDates = { ...prev };
        delete newDates[id];
        return newDates;
      });
    }
  }, []);

  const handleNextTargetDateChange = useCallback((id, value) => {
    setNextTargetDate((prev) => ({ ...prev, [id]: value }));
  }, []);

  const fileToBase64 = useCallback((file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result);
      reader.onerror = (error) => reject(error);
    });
  }, []);

  const toggleHistory = useCallback(() => {
    setShowHistory((prev) => !prev);
    resetFilters();
  }, [resetFilters]);

  const handleSubmit = async () => {
    const selectedItemsArray = Array.from(selectedItems);

    if (selectedItemsArray.length === 0) {
      showToast("Please select at least one item to submit", "error");
      return;
    }

    const missingStatus = selectedItemsArray.filter((id) => !statusData[id]);
    if (missingStatus.length > 0) {
      showToast(
        `Please select a status for all selected items.`, "error"
      );
      return;
    }

    const missingNextDate = selectedItemsArray.filter(
      (id) => statusData[id] === "Extend date" && !nextTargetDate[id]
    );
    if (missingNextDate.length > 0) {
      showToast(
        `Please select a next target date for extensions.`, "error"
      );
      return;
    }

    const missingRequiredImages = selectedItemsArray.filter((id) => {
      const item = delegation.find((account) => account.id === id);
      const requiresAttachment =
        item.require_attachment &&
        item.require_attachment.toUpperCase() === "YES";
      return requiresAttachment && !uploadedImages[id] && !item.image;
    });

    if (missingRequiredImages.length > 0) {
      showToast(
        `Please upload images for all required attachments.`, "error"
      );
      return;
    }

    setIsSubmitting(true);

    // Helper to ensure valid ISO timestamp for DB
    const ensureISO = (dateStr) => {
      return ensureISTISO(dateStr);
    };

    try {
      const selectedData = selectedItemsArray.map((id) => {
        const item = delegation.find((account) => account.id === id);

        let dbStatus = statusData[id] === "Done" ? "done" :
          statusData[id] === "Extend date" ? "extend" :
            statusData[id];



        return {
          id: item.id,
          department: item.department || '',
          given_by: item.given_by || '',
          name: item.name,
          task_description: item.task_description,
          task_start_date: ensureISO(item.task_start_date),
          planned_date: ensureISO(item.planned_date),
          status: dbStatus,
          next_extend_date: statusData[id] === "Extend date" ? ensureISO(nextTargetDate[id]) : null,
          reason: remarksData[id] || "",
          duration: item.duration || "",
          image_url: uploadedImages[id] ? null : item.image,
          require_attachment: item.require_attachment,
          audio_url: item.audio_url || null,
          submission_timestamp: getNowISTISOString()
        };
      });

      console.log("Selected Data for submission:", selectedData);

      const action = await dispatch(
        insertDelegationDoneAndUpdate({
          selectedDataArray: selectedData,
          uploadedImages: uploadedImages,
        })
      );

      if (insertDelegationDoneAndUpdate.fulfilled.match(action)) {
        const results = action.payload;
        const failedTasks = results.filter(r => r.status === 'error');

        // Send WhatsApp notifications for extensions
        for (const task of selectedData) {
          if (task.status === 'extend' && task.next_extend_date) {
            try {
              await sendTaskExtensionNotification({
                doerName: task.name,
                taskId: task.id,
                description: task.task_description,
                nextExtendDate: formatDateToDDMMYYYY(new Date(task.next_extend_date)),
                givenBy: task.given_by || username
              });
            } catch (waErr) {
              console.error("WhatsApp extension notification failed:", waErr);
            }
          }
        }

        if (failedTasks.length > 0) {
          console.error('Some tasks failed to submit:', failedTasks);
          showToast(`${failedTasks.length} task(s) failed to submit.`, "error");
        } else {
          showToast(`Successfully submitted ${selectedItemsArray.length} task records!`, "success");
          setSelectedItems(new Set());
          setAdditionalData({});
          setRemarksData({});
          setStatusData({});
          setNextTargetDate({});
          setUploadedImages({});
        }
      } else {
        throw new Error(action.payload || 'Submission failed');
      }

      setTimeout(() => {
        dispatch(delegationData());
        dispatch(delegation_DoneData());
      }, 1000);

    } catch (error) {
      console.error('Submission error:', error);
      showToast('An error occurred during submission.', "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSendUrgentWhatsApp = async () => {
    if (selectedItems.size === 0) return;

    setIsSubmitting(true);
    try {
      const selectedTasks = delegation.filter(t => selectedItems.has(t.id));

      for (const task of selectedTasks) {
        await sendUrgentTaskNotification({
          doerName: task.name,
          taskId: task.id,
          description: task.task_description,
          dueDate: formatDateTimeForDisplay(task.planned_date || task.task_start_date),
          givenBy: task.given_by || username,
          taskType: 'delegation',
          department: task.department
        });
      }

      showToast(`Urgent WhatsApp notifications sent successfully!`, "success");
      setSelectedItems(new Set());
    } catch (err) {
      console.error("WhatsApp error:", err);
      showToast("Failed to send WhatsApp messages.", "error");
    } finally {
      setIsSubmitting(false);
    }
  };


  const selectedItemsCount = selectedItems.size;

  return (
    <AdminLayout>
      <>
      <div className="space-y-4 sm:space-y-6">
        {/* Sticky Header and Controls */}
        <div className="sticky top-0 z-40 bg-gray-50/95 backdrop-blur-md pt-2 pb-4 space-y-4 -mx-2 px-2 sm:mx-0 sm:px-0">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-purple-700">
            {showHistory
              ? CONFIG.PAGE_CONFIG.historyTitle
              : CONFIG.PAGE_CONFIG.title}
          </h1>

          <div className="bg-white/80 backdrop-blur-sm rounded-xl p-4 border border-purple-50 shadow-sm">
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-4">
              <div className="relative flex-1">
                <Search
                  className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
                  size={18}
                />
                <input
                  type="text"
                  placeholder={
                    showHistory ? "Search by Task ID..." : "Search tasks..."
                  }
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-purple-200 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                />
              </div>

              <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                {!showHistory && (
                  <div className="flex items-center gap-2 flex-1 sm:flex-none">
                    <select
                      value={dateFilter}
                      onChange={(e) => setDateFilter(e.target.value)}
                      className="w-full sm:w-auto border border-purple-200 rounded-md px-3 py-2 text-xs sm:text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-500 h-10"
                    >
                      {filterOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <button
                  onClick={toggleHistory}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 sm:px-4 py-2 text-sm font-medium text-purple-700 bg-white border border-purple-200 rounded-md hover:bg-purple-50 transition-colors shadow-sm h-10"
                >
                  {showHistory ? (
                    <>
                      <ArrowLeft className="h-4 w-4 mr-1" />
                      <span>Back</span>
                    </>
                  ) : (
                    <>
                      <History className="h-4 w-4 mr-1" />
                      <span>History</span>
                    </>
                  )}
                </button>

                {!showHistory && (
                  <>
                    <button
                      onClick={handleSendUrgentWhatsApp}
                      disabled={selectedItems.size === 0 || isSubmitting}
                      className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 sm:px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-all h-10"
                      title="Send Urgent WhatsApp"
                    >
                      <BellRing className="h-4 w-4" />
                      <span className="hidden sm:inline">Urgent WhatsApp</span>
                      <span className="sm:hidden">Urgent</span>
                    </button>

                    <button
                      onClick={handleSubmit}
                      disabled={selectedItemsCount === 0 || isSubmitting}
                      className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 sm:px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-md hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-colors h-10"
                    >
                      {isSubmitting
                        ? "..."
                        : (
                          <>
                            <span className="hidden sm:inline">Submit Selected ({selectedItemsCount})</span>
                            <span className="sm:hidden">Submit ({selectedItemsCount})</span>
                          </>
                        )}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {successMessage && (
          <div className="bg-green-50 border border-green-200 text-green-700 px-3 sm:px-4 py-3 rounded-md flex items-center justify-between text-sm sm:text-base">
            <div className="flex items-center">
              <CheckCircle2 className="h-4 w-4 sm:h-5 sm:w-5 mr-2 text-green-500 flex-shrink-0" />
              <span className="break-words">{successMessage}</span>
            </div>
            <button
              onClick={() => setSuccessMessage("")}
              className="text-green-500 hover:text-green-700 ml-2 flex-shrink-0"
            >
              <X className="h-4 w-4 sm:h-5 sm:w-5" />
            </button>
          </div>
        )}

        <div className="rounded-lg border border-purple-200 shadow-md bg-white overflow-hidden">
          <div className="bg-gradient-to-r from-purple-50 to-pink-50 border-b border-purple-100 p-3 sm:p-4">
            <h2 className="text-purple-700 font-medium text-sm sm:text-base">
              {showHistory
                ? `Completed ${CONFIG.SOURCE_SHEET_NAME} Tasks`
                : `Pending ${CONFIG.SOURCE_SHEET_NAME} Tasks`}
            </h2>
            <p className="text-purple-600 text-xs sm:text-sm mt-1">
              {showHistory
                ? `${CONFIG.PAGE_CONFIG.historyDescription} for ${userRole === "admin" ? "all" : "your"
                } tasks`
                : CONFIG.PAGE_CONFIG.description}
            </p>
          </div>

          {loading ? (
            <div className="text-center py-10">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-purple-500 mb-4"></div>
              <p className="text-purple-600 text-sm sm:text-base">Loading task data...</p>
            </div>
          ) : error ? (
            <div className="bg-red-50 p-4 rounded-md text-red-800 text-center text-sm sm:text-base">
              {error}{" "}
              <button
                className="underline ml-2"
                onClick={() => window.location.reload()}
              >
                Try again
              </button>
            </div>
          ) : showHistory ? (
            <>
              {/* Simplified History Filters - Only Date Range */}
              <div className="p-3 sm:p-4 border-b border-purple-100 bg-gray-50">
                <div className="flex flex-col gap-3 sm:gap-4">
                  <div className="flex flex-col">
                    <div className="mb-2 flex items-center">
                      <span className="text-xs sm:text-sm font-medium text-purple-700">
                        Filter by Date Range:
                      </span>
                    </div>
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
                      <div className="flex items-center w-full sm:w-auto">
                        <label
                          htmlFor="start-date"
                          className="text-xs sm:text-sm text-gray-700 mr-1 whitespace-nowrap"
                        >
                          From
                        </label>
                        <input
                          id="start-date"
                          type="date"
                          value={startDate}
                          onChange={(e) => setStartDate(e.target.value)}
                          className="flex-1 sm:flex-none text-xs sm:text-sm border border-gray-200 rounded-md p-1"
                        />
                      </div>
                      <div className="flex items-center w-full sm:w-auto">
                        <label
                          htmlFor="end-date"
                          className="text-xs sm:text-sm text-gray-700 mr-1 whitespace-nowrap"
                        >
                          To
                        </label>
                        <input
                          id="end-date"
                          type="date"
                          value={endDate}
                          onChange={(e) => setEndDate(e.target.value)}
                          className="flex-1 sm:flex-none text-xs sm:text-sm border border-gray-200 rounded-md p-1"
                        />
                      </div>
                    </div>
                  </div>

                  {(startDate || endDate || searchTerm) && (
                    <button
                      onClick={resetFilters}
                      className="px-3 py-1 bg-red-100 text-red-700 rounded-md hover:bg-red-200 text-xs sm:text-sm w-full sm:w-auto"
                    >
                      Clear All Filters
                    </button>
                  )}
                </div>
                <PaginationUI />
              </div>

              {/* History Table - Mobile Responsive */}
              <div className="hidden md:block overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50 sticky top-0 z-20 shadow-sm">
                    <tr>
                      <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                        Task ID
                      </th>
                      <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[200px]">
                        Task
                      </th>
                      <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                        Timestamp
                      </th>
                      <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                        Status
                      </th>
                      <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                        Next Target
                      </th>
                      <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[150px]">
                        Remarks
                      </th>
                      <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                        Image
                      </th>
                      {userRole === "admin" && (
                        <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                          User
                        </th>
                      )}
                      <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                        Given By
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {paginatedTasks.length > 0 ? (
                      paginatedTasks.map((history, index) => (
                        <tr key={index} className="hover:bg-gray-50">
                          <td className="px-3 sm:px-6 py-2 sm:py-4">
                            <div className="text-xs sm:text-sm text-gray-900 whitespace-normal break-words">
                              {history.id || "—"}
                            </div>
                          </td>
                          <td className="px-3 sm:px-6 py-2 sm:py-4 min-w-[200px] max-w-[300px]">
                            <RenderDescription text={history.task_description} audioUrl={history.audio_url} instructionUrl={history.instruction_attachment_url} instructionType={history.instruction_attachment_type} />
                          </td>
                          <td className="px-3 sm:px-6 py-2 sm:py-4">
                            <div className="text-xs sm:text-sm font-medium text-gray-900 whitespace-normal break-words">
                              {formatDateTimeForDisplay(history.created_at) ||
                                "—"}
                            </div>
                          </td>
                          <td className="px-3 sm:px-6 py-2 sm:py-4">
                            <span
                              className={`px-2 py-0.5 text-[10px] font-bold rounded-full uppercase ${history.status === "done"
                                ? (history.admin_done ? "bg-green-100 text-green-800" : "bg-orange-100 text-orange-800")
                                : history.status === "rejected"
                                  ? "bg-red-100 text-red-800"
                                  : history.status === "extend"
                                    ? "bg-yellow-100 text-yellow-800"
                                    : history.status === "pending"
                                      ? "bg-orange-100 text-orange-800"
                                      : "bg-gray-100 text-gray-800"
                                }`}
                            >
                              {history.status === "done"
                                ? (history.admin_done ? "Approved" : "Pending Approval")
                                : (history.status === "pending" ? "Pending Approval" :
                                  history.status === "rejected" ? "Rejected" :
                                    history.status === "extend" ? "Extended" :
                                      (history.status || "—"))}
                            </span>
                          </td>
                          <td className="px-3 sm:px-6 py-2 sm:py-4">
                            <div className="text-xs sm:text-sm text-gray-900 whitespace-normal break-words">
                              {formatDateTimeForDisplay(
                                history.next_extend_date
                              ) || "—"}
                            </div>
                          </td>
                          <td className="px-3 sm:px-6 py-2 sm:py-4 bg-purple-50 min-w-[150px] max-w-[250px]">
                            <div
                              className="text-xs sm:text-sm text-gray-900 whitespace-normal break-words leading-relaxed"
                              title={history.reason}
                            >
                              {history.reason || "—"}
                            </div>
                          </td>
                          <td className="px-3 sm:px-6 py-2 sm:py-4">
                            {history.image_url ? (
                              <a
                                href={history.image_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:text-blue-800 underline flex items-center"
                              >
                                <img
                                  src={
                                    history.image_url ||
                                    "/api/placeholder/32/32"
                                  }
                                  alt="Attachment"
                                  className="h-6 w-6 sm:h-8 sm:w-8 object-cover rounded-md mr-2 flex-shrink-0"
                                />
                                <span className="text-xs whitespace-normal break-words">
                                  View
                                </span>
                              </a>
                            ) : (
                              <span className="text-gray-400 text-xs">
                                No file
                              </span>
                            )}
                          </td>
                          {userRole === "admin" && (
                            <td className="px-3 sm:px-6 py-2 sm:py-4">
                              <div className="text-xs sm:text-sm text-gray-900 whitespace-normal break-words">
                                {history.name || "—"}
                              </div>
                            </td>
                          )}
                          <td className="px-3 sm:px-6 py-2 sm:py-4">
                            <div className="text-xs sm:text-sm text-gray-900 whitespace-normal break-words">
                              {history.given_by || "—"}
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td
                          colSpan={userRole === "admin" ? 9 : 8}
                          className="px-4 sm:px-6 py-4 text-center text-gray-500 text-xs sm:text-sm"
                        >
                          {searchTerm || startDate || endDate
                            ? "No historical records matching your filters"
                            : "No completed records found"}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Mobile History Cards */}
              <div className="md:hidden space-y-4 p-4 bg-gray-50/50">
                {paginatedTasks.length > 0 ? (
                  paginatedTasks.map((history, index) => (
                    <div key={index} className="bg-white rounded-xl border border-purple-100 shadow-sm overflow-hidden">
                      <div className="bg-purple-50/50 px-4 py-3 border-b border-purple-100 flex justify-between items-center">
                        <span className="text-xs font-bold text-purple-800">#{history.id || index}</span>
                        <span
                          className={`px-2 py-0.5 text-[10px] font-bold rounded-full uppercase ${history.status?.toLowerCase() === "done"
                            ? (history.admin_done ? "bg-green-100 text-green-800" : "bg-orange-100 text-orange-800")
                            : history.status === "pending_approval"
                              ? "bg-orange-100 text-orange-800"
                              : history.status === "extend"
                                ? "bg-yellow-100 text-yellow-800"
                                : "bg-gray-100 text-gray-800"
                            }`}
                        >
                          {history.status === "done"
                            ? (history.admin_done ? "Approved" : "Pending Approval")
                            : (history.status === "pending" ? "Pending Approval" :
                              history.status === "rejected" ? "Rejected" :
                                history.status === "extend" ? "Extended" :
                                  (history.status || "—"))}
                        </span>
                      </div>
                      <div className="p-4 space-y-3">
                        <div className="space-y-1">
                          <p className="text-[10px] text-gray-400 uppercase font-semibold">Task</p>
                          <RenderDescription text={history.task_description} audioUrl={history.audio_url} instructionUrl={history.instruction_attachment_url} instructionType={history.instruction_attachment_type} />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <p className="text-[10px] text-gray-400 uppercase font-semibold">Timestamp</p>
                            <p className="text-xs text-gray-700">{formatDateTimeForDisplay(history.created_at)}</p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-[10px] text-gray-400 uppercase font-semibold">Given By</p>
                            <p className="text-xs text-gray-700 font-bold">{history.given_by || "—"}</p>
                          </div>
                        </div>
                        {history.next_extend_date && (
                          <div className="space-y-1">
                            <p className="text-[10px] text-gray-400 uppercase font-semibold">Next Target</p>
                            <p className="text-xs text-indigo-600 font-bold">{formatDateTimeForDisplay(history.next_extend_date)}</p>
                          </div>
                        )}
                        {history.reason && (
                          <div className="space-y-1 p-2 bg-purple-50 rounded">
                            <p className="text-[10px] text-purple-400 uppercase font-semibold">Remarks</p>
                            <p className="text-xs text-purple-700 italic">{history.reason}</p>
                          </div>
                        )}
                        {history.image_url && (
                          <div className="pt-2 border-t border-gray-50">
                            <a href={history.image_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-blue-600 font-bold text-xs">
                              <img src={history.image_url} className="w-8 h-8 rounded object-cover border" alt="preview" />
                              View Attachment
                            </a>
                          </div>
                        )}
                      </div>
                    </div>
                  ))) : (
                  <div className="text-center py-10 text-gray-400 bg-white rounded-xl border border-dashed border-gray-200">
                    <p>No records found</p>
                  </div>
                )}
              </div>
              <PaginationUI />
            </>
          ) : (
            <>
              {/* Regular Tasks Table - Mobile Responsive */}
              <div className="hidden md:block overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-2 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                          checked={
                            (() => {
                              const selectableTasks = paginatedTasks.filter(t => t.timeStatus !== "Upcoming");
                              return selectableTasks.length > 0 && selectableTasks.every(t => selectedItems.has(t.id));
                            })()
                          }
                          onChange={handleSelectAllItems}
                        />
                      </th>
                      <th className="px-2 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                        Time Status
                      </th>
                      <th className="px-2 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                        Task ID
                      </th>
                      <th className="px-2 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[200px]">
                        Task Description
                      </th>
                      <th className="px-2 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                        Department
                      </th>
                      <th className="px-2 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                        Given By
                      </th>
                      <th className="px-2 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                        Name
                      </th>
                      <th className="px-2 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                        Last Activity
                      </th>
                      <th className="px-2 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap bg-green-50">
                        Planned Date
                      </th>
                      <th className="px-2 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap bg-blue-50">
                        Select Status
                      </th>
                      <th className="px-2 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap bg-indigo-50">
                        Next Target
                      </th>
                      <th className="px-2 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[150px] bg-purple-50">
                        Remarks
                      </th>
                      <th className="px-2 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap bg-orange-50">
                        Upload
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {paginatedTasks.length > 0 ? (
                      paginatedTasks.map((task, index) => {
                        const isSelected = selectedItems.has(task.id);
                        const showHeader = index === 0 || task.timeStatus !== paginatedTasks[index - 1].timeStatus;
                        
                        return (
                          <Fragment key={index}>
                            {showHeader && (
                              <tr className="bg-gray-100/50">
                                <td colSpan={13} className="px-6 py-2">
                                  <div className="flex items-center gap-2">
                                    <div className={`w-2 h-2 rounded-full ${
                                      task.timeStatus === "Overdue" ? "bg-red-500" :
                                      task.timeStatus === "Today" ? "bg-amber-500" :
                                      "bg-blue-500"
                                    }`} />
                                    <span className="text-[11px] font-black uppercase tracking-[0.2em] text-gray-500">
                                      {task.timeStatus} Tasks
                                    </span>
                                  </div>
                                </td>
                              </tr>
                            )}
                            <tr
                              className={`${isSelected ? "bg-purple-50" : ""} hover:bg-gray-50`}
                            >
                            <td className="px-2 sm:px-6 py-2 sm:py-4">
                              <input
                                type="checkbox"
                                className="h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500 disabled:opacity-30 disabled:cursor-not-allowed transition-opacity"
                                checked={isSelected}
                                disabled={task.timeStatus === "Upcoming"}
                                title={task.timeStatus === "Upcoming" ? "Cannot submit upcoming tasks" : ""}
                                onChange={(e) =>
                                  handleCheckboxClick(e, task.id)
                                }
                              />
                            </td>
                            <td className="px-2 sm:px-6 py-2 sm:py-4">
                              <div className="text-[10px] font-bold">
                                <span className={`px-2 py-0.5 rounded-full ${task.timeStatus === "Overdue" ? "bg-red-100 text-red-700" :
                                  task.timeStatus === "Today" ? "bg-amber-100 text-amber-700" :
                                    task.timeStatus === "Upcoming" ? "bg-blue-100 text-blue-700" :
                                      "bg-gray-100 text-gray-700"
                                  }`}>
                                  {task.timeStatus}
                                </span>
                              </div>
                            </td>
                            <td className="px-2 sm:px-6 py-2 sm:py-4">
                              <div className="text-xs sm:text-sm text-gray-900 whitespace-normal break-words">
                                {task.id || "—"}
                              </div>
                            </td>
                            <td className="px-2 sm:px-6 py-2 sm:py-4 min-w-[200px] max-w-[300px]">
                              <div
                                className="text-xs sm:text-sm text-gray-900 whitespace-normal break-words leading-relaxed"
                              >
                                <RenderDescription text={task.task_description} audioUrl={task.audio_url} instructionUrl={task.instruction_attachment_url} instructionType={task.instruction_attachment_type} />
                              </div>
                            </td>
                            <td className="px-2 sm:px-6 py-2 sm:py-4">
                              <div className="text-xs sm:text-sm text-gray-900 whitespace-normal break-words">
                                {task.department || "—"}
                              </div>
                            </td>
                            <td className="px-2 sm:px-6 py-2 sm:py-4">
                              <div className="text-xs sm:text-sm text-gray-900 whitespace-normal break-words">
                                {task.given_by || "—"}
                              </div>
                            </td>
                            <td className="px-2 sm:px-6 py-2 sm:py-4">
                              <div className="text-xs sm:text-sm text-gray-900 whitespace-normal break-words">
                                {task.name || "—"}
                              </div>
                            </td>
                            <td className="px-2 sm:px-6 py-2 sm:py-4">
                              <div className="text-[10px] text-purple-600 font-bold whitespace-nowrap">
                                {task.submission_date ? formatDateTimeForDisplay(task.submission_date) : "New Task"}
                              </div>
                            </td>
                            <td className="px-2 sm:px-6 py-2 sm:py-4 bg-green-50">
                              <div className="text-xs sm:text-sm text-gray-900 whitespace-normal break-words">
                                {formatDateTimeForDisplay(task.planned_date)}
                              </div>
                            </td>
                            <td className="px-2 sm:px-6 py-2 sm:py-4 bg-blue-50">
                              <select
                                disabled={!isSelected}
                                value={statusData[task.id] || ""}
                                onChange={(e) =>
                                  handleStatusChange(
                                    task.id,
                                    e.target.value
                                  )
                                }
                                className="border border-gray-300 rounded-md px-2 py-1 w-full disabled:bg-gray-100 disabled:cursor-not-allowed text-xs sm:text-sm"
                              >
                                <option value="">Select</option>
                                <option value="Done">Done</option>
                                <option value="Extend date">Extend</option>
                              </select>
                            </td>
                            <td className="px-2 sm:px-6 py-2 sm:py-4 bg-indigo-50">
                              <input
                                type="date"
                                disabled={
                                  !isSelected ||
                                  statusData[task.id] !== "Extend date"
                                }
                                value={nextTargetDate[task.id] || ""}
                                onChange={(e) => {
                                  handleNextTargetDateChange(
                                    task.id,
                                    e.target.value
                                  );
                                }}
                                className="border border-gray-300 rounded-md px-2 py-1 w-full disabled:bg-gray-100 disabled:cursor-not-allowed text-xs sm:text-sm"
                              />
                            </td>
                            <td className="px-2 sm:px-6 py-2 sm:py-4 min-w-[150px] max-w-[250px] bg-purple-50">
                              <textarea
                                placeholder="Enter remarks"
                                disabled={!isSelected}
                                value={remarksData[task.id] || ""}
                                onChange={(e) =>
                                  setRemarksData((prev) => ({
                                    ...prev,
                                    [task.id]: e.target.value,
                                  }))
                                }
                                className="border border-gray-300 rounded-md px-3 py-2 w-full h-8 sm:h-auto min-h-[32px] sm:min-h-[64px] disabled:bg-gray-100 disabled:cursor-not-allowed text-xs sm:text-sm resize-none"
                              />
                            </td>
                            <td className="px-2 sm:px-6 py-2 sm:py-4 bg-orange-50">
                              {uploadedImages[task.id] ? (
                                <div className="flex items-center space-x-2 p-1 bg-green-50 rounded border border-green-200">
                                  <span className="text-[10px] text-green-700 truncate max-w-[80px]">
                                    {uploadedImages[task.id].name}
                                  </span>
                                  <button
                                    onClick={() =>
                                      setUploadedImages((prev) => {
                                        const newState = { ...prev };
                                        delete newState[task.id];
                                        return newState;
                                      })
                                    }
                                    className="text-red-500 hover:text-red-700"
                                  >
                                    <X size={14} />
                                  </button>
                                </div>
                              ) : task.image ? (
                                <div className="flex items-center space-x-2">
                                  <img
                                    src={task.image}
                                    className="w-8 h-8 rounded object-cover border"
                                    alt="preview"
                                  />
                                  <button
                                    onClick={() => {
                                      setViewerMedia({ url: task.image, type: 'image' });
                                      setViewerOpen(true);
                                    }}
                                    className="text-purple-600 text-xs font-bold underline"
                                  >
                                    View
                                  </button>
                                </div>
                              ) : (
                                <label className="cursor-pointer group">
                                  <div className={`flex items-center justify-center p-2 rounded-lg border-2 border-dashed transition-all ${isSelected ? "border-purple-300 group-hover:border-purple-500 bg-purple-50" : "border-gray-200 bg-gray-50 opacity-50 cursor-not-allowed"}`}>
                                    <Upload
                                      size={18}
                                      className={isSelected ? "text-purple-500" : "text-gray-400"}
                                    />
                                    {task.require_attachment?.toUpperCase() ===
                                      "YES" && (
                                        <span className="ml-1 text-[10px] text-red-500 font-bold">
                                          *
                                        </span>
                                      )}
                                  </div>
                                  <input
                                    type="file"
                                    className="hidden"
                                    accept="image/*"
                                    disabled={!isSelected}
                                    onChange={(e) =>
                                      handleImageUpload(task.id, e)
                                    }
                                  />
                                </label>
                              )}
                            </td>
                          </tr>
                        </Fragment>
                      );
                    })
                    ) : (
                      <tr>
                        <td
                          colSpan={11}
                          className="px-4 sm:px-6 py-4 text-center text-gray-500 text-xs sm:text-sm"
                        >
                          {searchTerm
                            ? "No tasks matching your search"
                            : "No pending tasks found"}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Mobile view Toolbar */}
              {!showHistory && (
                <div className="md:hidden sticky top-[header_height] z-30 transition-all duration-300">
                  <div className="bg-white border-b border-purple-100 px-4 py-3 flex items-center justify-between shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="relative flex items-center">
                        <input
                          type="checkbox"
                          checked={(() => {
                            const submittableTasks = paginatedTasks.filter(t => t.timeStatus !== "Upcoming");
                            return submittableTasks.length > 0 && submittableTasks.every(t => selectedItems.has(t.id));
                          })()}
                          onChange={handleSelectAllItems}
                          className="h-5 w-5 text-purple-600 border-gray-300 rounded focus:ring-purple-500 transition-all cursor-pointer"
                        />
                      </div>
                      <span className="text-sm font-black text-gray-700 uppercase tracking-tight">Select All Tasks</span>
                    </div>
                    
                    {selectedItems.size > 0 && (
                      <button 
                        onClick={() => { 
                          setSelectedItems(new Set()); 
                          setRemarksData({}); 
                          setUploadedImages({}); 
                          setStatusData({}); 
                          setNextTargetDate({});
                        }}
                        className="text-[10px] font-black text-red-500 uppercase tracking-widest hover:text-red-700 transition-colors"
                      >
                        Clear Selection
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Mobile Regular Task Cards */}
              <div className="md:hidden space-y-4 p-4 bg-gray-50/50 pb-24">
                {paginatedTasks.length > 0 ? (
                  paginatedTasks.map((task, index) => {
                    const isSelected = selectedItems.has(task.id);
                    const showHeader = index === 0 || task.timeStatus !== paginatedTasks[index - 1].timeStatus;
                    
                    return (
                      <Fragment key={index}>
                        {showHeader && (
                          <div className={`mt-4 mb-2 px-3 py-1 rounded-full w-fit text-[10px] font-black uppercase tracking-widest flex items-center gap-2 ${
                            task.timeStatus === "Overdue" ? "bg-red-50 text-red-600 border border-red-100" :
                            task.timeStatus === "Today" ? "bg-amber-50 text-amber-600 border border-amber-100" :
                            "bg-blue-50 text-blue-600 border border-blue-100"
                          }`}>
                             <div className={`w-1.5 h-1.5 rounded-full ${
                              task.timeStatus === "Overdue" ? "bg-red-500" :
                              task.timeStatus === "Today" ? "bg-amber-500" :
                              "bg-blue-500"
                            }`} />
                            {task.timeStatus} Tasks
                          </div>
                        )}
                        <div key={index} className={`bg-white rounded-xl border border-purple-100 shadow-sm overflow-hidden ${isSelected ? "ring-2 ring-purple-400" : ""}`}>
                        <div className="bg-purple-50/50 px-4 py-3 border-b border-purple-100 flex justify-between items-center">
                          <div className="flex items-center gap-3">
                            <input
                              type="checkbox"
                              className="h-5 w-5 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                              checked={isSelected}
                              onChange={(e) => handleCheckboxClick(e, task.id)}
                            />
                            <span className="text-xs font-bold text-purple-800 uppercase tracking-wider">#{task.id}</span>
                          </div>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${task.timeStatus === "Overdue" ? "bg-red-100 text-red-700" :
                            task.timeStatus === "Today" ? "bg-amber-100 text-amber-700" :
                              task.timeStatus === "Upcoming" ? "bg-blue-100 text-blue-700" :
                                "bg-gray-100 text-gray-700"
                            }`}>
                            {task.timeStatus}
                          </span>
                        </div>
                        <div className="p-4 space-y-4">
                          <div className="space-y-1">
                            <p className="text-[10px] text-gray-400 uppercase font-semibold">Description</p>
                            <div className="text-sm text-gray-800">
                              <RenderDescription text={task.task_description} audioUrl={task.audio_url} instructionUrl={task.instruction_attachment_url} instructionType={task.instruction_attachment_type} />
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                              <p className="text-[10px] text-gray-400 uppercase font-semibold">Department</p>
                              <p className="text-xs font-bold text-gray-700">{task.department || "—"}</p>
                            </div>
                            <div className="space-y-1">
                              <p className="text-[10px] text-gray-400 uppercase font-semibold">Given By</p>
                              <p className="text-xs font-bold text-gray-700">{task.given_by || "—"}</p>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-4 pt-2 border-t border-gray-50">
                            <div className="space-y-1">
                              <p className="text-[10px] text-green-500 uppercase font-semibold">Planned Date</p>
                              <p className="text-xs font-black text-gray-900">{formatDateTimeForDisplay(task.planned_date)}</p>
                            </div>
                            <div className="space-y-1 text-right">
                              <p className="text-[10px] text-purple-600 uppercase font-semibold">Last Activity</p>
                              <p className="text-[10px] font-bold text-gray-900">{task.submission_date ? formatDateTimeForDisplay(task.submission_date) : "New Task"}</p>
                            </div>
                          </div>

                          <div className="space-y-3 pt-3 border-t border-gray-50">
                            <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-1">
                                <p className="text-[10px] text-gray-400 uppercase font-semibold">Status</p>
                                <select
                                  disabled={!isSelected}
                                  value={statusData[task.id] || ""}
                                  onChange={(e) => handleStatusChange(task.id, e.target.value)}
                                  className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-xs focus:ring-purple-400"
                                >
                                  <option value="">Select</option>
                                  <option value="Done">Done</option>
                                  <option value="Extend date">Extend</option>
                                </select>
                              </div>
                              <div className="space-y-1">
                                <p className="text-[10px] text-gray-400 uppercase font-semibold">Next Target</p>
                                <input
                                  type="date"
                                  disabled={!isSelected || statusData[task.id] !== "Extend date"}
                                  value={nextTargetDate[task.id] || ""}
                                  onChange={(e) => handleNextTargetDateChange(task.id, e.target.value)}
                                  className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-xs disabled:bg-gray-50"
                                />
                              </div>
                            </div>

                            <div className="space-y-1">
                              <p className="text-[10px] text-gray-400 uppercase font-semibold">Remarks</p>
                              <textarea
                                placeholder="Enter remarks"
                                disabled={!isSelected}
                                value={remarksData[task.id] || ""}
                                onChange={(e) => setRemarksData((prev) => ({ ...prev, [task.id]: e.target.value }))}
                                className="w-full border border-gray-300 rounded-md px-3 py-2 text-xs focus:ring-purple-400 resize-none"
                                rows="2"
                              />
                            </div>

                            <div className="space-y-1">
                              <p className="text-[10px] text-gray-400 uppercase font-semibold">Attachment</p>
                              {uploadedImages[task.id] ? (
                                <div className="flex items-center gap-2 p-2 bg-green-50 rounded border border-green-100">
                                  <Upload className="h-4 w-4 text-green-600" />
                                  <span className="text-[10px] text-green-700 font-bold truncate flex-1">{uploadedImages[task.id].name}</span>
                                  <button onClick={() => setUploadedImages(prev => { const next = { ...prev }; delete next[task.id]; return next; })} className="text-red-400"><X size={14} /></button>
                                </div>
                              ) : task.image ? (
                                <div className="flex items-center gap-2 p-2 bg-purple-50 rounded border border-purple-100">
                                  <img src={task.image} className="w-8 h-8 rounded object-cover" alt="preview" />
                                  <span className="text-[10px] text-purple-700 font-bold">Uploaded</span>
                                  <button onClick={() => {
                                    setViewerMedia({ url: task.image, type: 'image' });
                                    setViewerOpen(true);
                                  }} className="ml-auto text-purple-600 text-[10px] font-bold">View</button>
                                </div>
                              ) : (
                                <label className={`flex items-center justify-center gap-2 p-3 border-2 border-dashed rounded-xl transition-all ${isSelected ? "border-purple-200 bg-purple-50 text-purple-600" : "border-gray-100 bg-gray-50 text-gray-300"}`}>
                                  <Upload size={16} />
                                  <span className="text-xs font-bold">{task.require_attachment?.toUpperCase() === "YES" ? "Required*" : "Upload"}</span>
                                  <input type="file" className="hidden" accept="image/*" disabled={!isSelected} onChange={(e) => handleImageUpload(task.id, e)} />
                                </label>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </Fragment>
                  )
                })
                ) : (
                  <div className="text-center py-20 bg-white rounded-xl border border-dashed border-gray-200">
                    <Search size={40} className="text-gray-100 mx-auto mb-3" />
                    <p className="text-gray-400 text-sm">No tasks found</p>
                  </div>
                )}
              </div>

              {/* Mobile Floating Submit Bar */}
              {!showHistory && selectedItems.size > 0 && (
                <div className="md:hidden fixed bottom-6 left-4 right-4 z-40 animate-in slide-in-from-bottom-8 duration-500">
                  <div className="bg-white rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.2)] border border-purple-100 p-2 overflow-hidden">
                    <div className="flex items-center justify-between">
                      <div className="pl-4">
                        <p className="text-[10px] font-black text-purple-600 uppercase tracking-[0.2em] mb-0.5">Delegation</p>
                        <p className="text-xs font-bold text-gray-500">{selectedItems.size} task{selectedItems.size !== 1 ? 's' : ''} selected</p>
                      </div>
                      <button
                        onClick={handleSubmit}
                        disabled={isSubmitting}
                        className="px-8 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white text-sm font-black rounded-xl shadow-lg shadow-purple-200 transition-all active:scale-95 flex items-center gap-2"
                      >
                        {isSubmitting ? (
                          <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Submitting</>
                        ) : (
                          <><CheckCircle2 className="w-4 h-4" /> Submit Now</>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <PaginationUI />
            </>
          )}
        </div>
      </div>
      <MediaViewer 
        isOpen={viewerOpen} 
        onClose={() => setViewerOpen(false)} 
        media={viewerMedia} 
      />
      </>
     </AdminLayout>
  );
}

export default DelegationDataPage;
