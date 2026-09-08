import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { fetchNotificationsApi, createNotificationApi, deleteNotificationApi, markAsReadApi, markAllAsReadApi } from "../api/notificationApi";

export const fetchNotifications = createAsyncThunk(
  "notifications/fetchNotifications",
  async ({ role, userId }, { rejectWithValue }) => {
    try {
      const data = await fetchNotificationsApi(role, userId);
      return data;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

export const markAsRead = createAsyncThunk(
  "notifications/markAsRead",
  async ({ notificationId, userId }, { rejectWithValue }) => {
    try {
      await markAsReadApi(notificationId, userId);
      return notificationId;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

export const markAllAsRead = createAsyncThunk(
  "notifications/markAllAsRead",
  async ({ notificationIds, userId }, { rejectWithValue }) => {
    try {
      await markAllAsReadApi(notificationIds, userId);
      return notificationIds;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

export const createNotification = createAsyncThunk(
  "notifications/createNotification",
  async (notificationData, { rejectWithValue }) => {
    try {
      const data = await createNotificationApi(notificationData);
      return data;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

export const removeNotification = createAsyncThunk(
  "notifications/deleteNotification",
  async (id, { rejectWithValue }) => {
    try {
      await deleteNotificationApi(id);
      return id;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

const notificationSlice = createSlice({
  name: "notifications",
  initialState: {
    list: [],
    loading: false,
    error: null,
  },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchNotifications.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchNotifications.fulfilled, (state, action) => {
        state.loading = false;
        state.list = action.payload;
      })
      .addCase(fetchNotifications.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(createNotification.fulfilled, (state, action) => {
        state.list.unshift(action.payload);
      })
      .addCase(removeNotification.fulfilled, (state, action) => {
        state.list = state.list.filter((n) => n.id !== action.payload);
      })
      .addCase(markAsRead.fulfilled, (state, action) => {
        const index = state.list.findIndex(n => n.id === action.payload);
        if (index !== -1) {
          state.list[index].isRead = true;
        }
      })
      .addCase(markAllAsRead.fulfilled, (state, action) => {
        const setIds = new Set(action.payload);
        state.list.forEach(n => {
          if (setIds.has(n.id)) {
            n.isRead = true;
          }
        });
      });
  },
});

export default notificationSlice.reducer;
