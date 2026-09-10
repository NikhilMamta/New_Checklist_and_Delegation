import supabase from '../SupabaseClient.js';

/**
 * MaytAPI WhatsApp Configuration
 */
const MAYTAPI_PRODUCT_ID = import.meta.env.VITE_MAYTAPI_PRODUCT_ID || import.meta.env.MAYTAPI_PRODUCT_ID || '';
const MAYTAPI_PHONE_ID = import.meta.env.VITE_MAYTAPI_PHONE_ID || import.meta.env.MAYTAPI_PHONE_ID || '';
const MAYTAPI_API_TOKEN = import.meta.env.VITE_MAYTAPI_API_TOKEN || import.meta.env.MAYTAPI_API_TOKEN || '';
const ADMIN_WHATSAPP_NUMBER = import.meta.env.VITE_ADMIN_WHATSAPP_NUMBER || '918827194777';
const ENABLE_WHATSAPP = import.meta.env.VITE_ENABLE_WHATSAPP === 'true';

// In-memory cache for user phone lookups to avoid repetitive database queries
const userPhoneCache = new Map();

/**
 * Format phone number to standard international format (without + or symbols)
 * Standard Indian format defaults to 91XXXXXXXXXX
 */
export const formatPhoneNumber = (phone) => {
    if (!phone) return null;
    let cleaned = String(phone).replace(/\D/g, '');
    if (!cleaned) return null;
    if (!cleaned.startsWith('91') && cleaned.length === 10) {
        cleaned = '91' + cleaned;
    }
    return cleaned;
};

/**
 * Format date or timestamp strings to clean human-readable date/time
 */
const formatDisplayDate = (val) => {
    if (!val) return null;
    if (typeof val === 'string' && !val.includes('T') && !val.includes('-')) {
        return val;
    }
    const d = new Date(val);
    if (isNaN(d.getTime())) return String(val);
    return d.toLocaleString('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short'
    });
};

/**
 * Normalizes task data against DATABASE_SCHEMA.md columns & component property conventions
 * Tables supported:
 * - checklist: task_id, name, given_by, task_description, task_start_date, planned_date, frequency, duration, remark, audio_url, department
 * - delegation: task_id, name, given_by, task_description, task_start_date, planned_date, duration, remarks, audio_url, department
 * - delegation_done: task_id, name, given_by, task_description, planned_date, next_extend_date, reason, audio_url
 * - ea_tasks / ea_tasks_done: task_id, doer_name, phone_number, planned_date, task_description, audio_url, duration, given_by
 * - maintenance_tasks: id, task_id, name, given_by, department, machine_name, part_name, part_area, freq, task_description, planned_date, remarks, audio_url
 * - repair_tasks: id, filled_by, assigned_person, machine_name, issue_description, audio_url, duration, remarks, submission_date
 * - users: id, username, user_name, name, number, role, department
 */
export const normalizeTaskData = (d = {}) => {
    const doer = d.doerName || d.doer_name || d.assigned_person || d.name || d.user_name || d.username || d.newDoerName || 'Team Member';
    const taskId = d.taskId || d.task_id || d.original_task_id || d.id || 'N/A';
    const description = d.description || d.task_description || d.issue_description || d.tasks || d.title || 'No description provided';
    const rawStart = d.startDate || d.plannedDate || d.planned_date || d.task_start_date || d.created_at;
    const rawDue = d.dueDate || d.plannedDate || d.planned_date || d.task_start_date || rawStart;
    const rawExtend = d.nextExtendDate || d.next_extend_date;
    const rawComplete = d.completionDate || d.submission_date || d.admin_approval_date;
    const givenBy = d.givenBy || d.given_by || d.filled_by || 'Admin';
    const department = d.department || d.assigned_dept;
    const machineName = d.machineName || d.machine_name;
    const partName = d.partName || d.part_name || d.part_replaced;
    const partArea = d.partArea || d.part_area;
    const audioUrl = d.audioUrl || d.audio_url;
    const duration = d.duration;
    const remark = d.remark || d.remarks || d.reason;
    const taskType = d.taskType || d._table || d.frequency || d.freq;
    const phone = d.phone || d.phoneNumber || d.phone_number || d.number;

    return {
        ...d,
        doerName: doer,
        taskId: taskId,
        description: description,
        startDate: formatDisplayDate(rawStart) || rawStart,
        dueDate: formatDisplayDate(rawDue) || rawDue,
        nextExtendDate: formatDisplayDate(rawExtend) || rawExtend,
        completionDate: formatDisplayDate(rawComplete) || rawComplete,
        givenBy: givenBy,
        department: department,
        machineName: machineName,
        partName: partName,
        partArea: partArea,
        audioUrl: audioUrl,
        duration: duration,
        remark: remark,
        reason: remark,
        taskType: taskType,
        phone: phone
    };
};

/**
 * Resolve phone number for a given username or phone identifier.
 * Looks up the 'users' table in Supabase if a name is provided.
 * Matches: users.number (contact), users.user_name / users.name / users.username (name)
 */
export const resolvePhoneNumber = async (userNameOrPhone) => {
    if (!userNameOrPhone) return null;

    const trimmed = String(userNameOrPhone).trim();

    // 1. Direct phone number check
    const digitsOnly = trimmed.replace(/\D/g, '');
    if (digitsOnly.length >= 10 && (digitsOnly.length === 10 || digitsOnly.length === 12)) {
        return formatPhoneNumber(digitsOnly);
    }

    // 2. Admin fallback
    if (trimmed.toLowerCase() === 'admin') {
        return formatPhoneNumber(ADMIN_WHATSAPP_NUMBER);
    }

    // 3. Cache lookup
    const cacheKey = trimmed.toLowerCase();
    if (userPhoneCache.has(cacheKey)) {
        return userPhoneCache.get(cacheKey);
    }

    // 4. Supabase DB lookup in 'users' table using 'number' column
    try {
        const cleanName = trimmed.replace(/[%,]/g, '');
        const { data, error } = await supabase
            .from('users')
            .select('number')
            .or(`user_name.ilike.%${cleanName}%,name.ilike.%${cleanName}%,username.ilike.%${cleanName}%`)
            .limit(1)
            .maybeSingle();

        if (error) {
            console.warn(`[WhatsAppService] Error looking up user "${trimmed}":`, error.message);
        } else if (data && data.number) {
            const formatted = formatPhoneNumber(data.number);
            if (formatted) {
                userPhoneCache.set(cacheKey, formatted);
                return formatted;
            }
        } else {
            console.warn(`[WhatsAppService] No phone number on file for user "${trimmed}".`);
        }
    } catch (err) {
        console.warn(`[WhatsAppService] Unexpected error fetching phone for "${trimmed}":`, err);
    }

    return null;
};

/**
 * Core MaytAPI Send Message Function
 */
export const sendMaytapiMessage = async ({ to, message, type = 'text', mediaUrl = null }) => {
    if (!to) {
        console.warn('[WhatsAppService] No destination phone number provided. Message skipped.');
        return { success: false, reason: 'No phone number provided' };
    }

    const formattedTo = formatPhoneNumber(to);
    if (!formattedTo) {
        console.warn(`[WhatsAppService] Invalid phone number "${to}". Message skipped.`);
        return { success: false, reason: 'Invalid phone number' };
    }

    // If disabled or credentials are not yet populated, fallback to development mock log
    if (!ENABLE_WHATSAPP || !MAYTAPI_PRODUCT_ID || !MAYTAPI_PHONE_ID || !MAYTAPI_API_TOKEN) {
        console.log(`📱 [MOCK WHATSAPP] (MaytAPI disabled or missing credentials)`);
        console.log(`To: +${formattedTo}`);
        console.log(`Message:\n${message}`);
        console.log('---');
        return { success: true, mock: true };
    }

    const endpoint = `https://api.maytapi.com/api/${MAYTAPI_PRODUCT_ID}/${MAYTAPI_PHONE_ID}/sendMessage`;

    const payload = {
        to_number: formattedTo,
        type: type,
        message: message,
    };

    if (type === 'media' && mediaUrl) {
        payload.message = mediaUrl;
        payload.text = message;
    }

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-maytapi-key': MAYTAPI_API_TOKEN
            },
            body: JSON.stringify(payload)
        });

        const result = await response.json().catch(() => ({}));
        if (!response.ok || (result && result.success === false)) {
            console.error('[WhatsAppService] MaytAPI Error:', result);
            return { success: false, error: result };
        }

        console.log(`✅ [WhatsAppService] Message sent to +${formattedTo}`);
        return { success: true, result };
    } catch (error) {
        console.error('[WhatsAppService] Network error sending WhatsApp message:', error);
        return { success: false, error };
    }
};

// ============================================================================
// MESSAGE TEMPLATES
// ============================================================================

export const TEMPLATES = {
    urgentTask: (raw) => {
        const d = normalizeTaskData(raw);
        const lines = [
            `🚨 *URGENT TASK ALERT* 🚨\n`,
            `Attention *${d.doerName}*, this task requires your *IMMEDIATE* attention:\n`,
            `▫️ *Task ID:* #${d.taskId}`,
            `▫️ *Module:* ${d.taskType ? String(d.taskType).toUpperCase() : 'URGENT'}`,
            `▫️ *Assigned By:* ${d.givenBy}`,
            `▫️ *Deadline / Due:* ${d.dueDate || 'Immediate'}`
        ];
        if (d.department) lines.push(`▫️ *Department:* ${d.department}`);
        if (d.machineName) lines.push(`▫️ *Machine / Part:* ${d.machineName}${d.partName ? ` / ${d.partName}` : ''}`);
        lines.push(`\n⚠️ *Task Details:*\n${d.description}`);
        if (d.audioUrl) lines.push(`\n🎧 *Voice Note / Audio:* ${d.audioUrl}`);
        lines.push(`\n⚡ *Action Required:* Please open your dashboard and attend to this immediately.`);
        return lines.join('\n');
    },

    taskAssignment: (raw) => {
        const d = normalizeTaskData(raw);
        const lines = [
            `📌 *NEW TASK ASSIGNED*\n`,
            `Hello *${d.doerName}*, you have been assigned a new task:\n`,
            `▫️ *Task ID:* #${d.taskId}`,
            `▫️ *Module / Type:* ${d.taskType ? String(d.taskType).toUpperCase() : 'TASK'}`,
            `▫️ *Assigned By:* ${d.givenBy}`,
            `▫️ *Start / Due Date:* ${d.startDate || d.dueDate || 'As scheduled'}`
        ];
        if (d.department) lines.push(`▫️ *Department:* ${d.department}`);
        if (d.machineName) lines.push(`▫️ *Machine / Part:* ${d.machineName}${d.partName ? ` / ${d.partName}` : ''}`);
        if (d.duration) lines.push(`▫️ *Estimated Duration:* ${d.duration} mins`);
        lines.push(`\n📝 *Description:*\n${d.description}`);
        if (d.audioUrl) lines.push(`\n🎧 *Voice Note / Audio:* ${d.audioUrl}`);
        lines.push(`\n👉 Please check your dashboard and update the status once completed.`);
        return lines.join('\n');
    },

    checklistTask: (raw) => {
        const d = normalizeTaskData(raw);
        const lines = [
            `📋 *CHECKLIST TASK ASSIGNED*\n`,
            `Hello *${d.doerName}*, a routine checklist task has been assigned to you:\n`,
            `▫️ *Task ID:* #${d.taskId}`,
            `▫️ *Assigned By:* ${d.givenBy}`,
            `▫️ *Scheduled Date:* ${d.startDate || 'Today'}`
        ];
        if (d.department) lines.push(`▫️ *Department:* ${d.department}`);
        if (d.duration) lines.push(`▫️ *Duration:* ${d.duration} mins`);
        lines.push(`\n📝 *Task Scope:*\n${d.description}`);
        if (d.audioUrl) lines.push(`\n🎧 *Audio Reference:* ${d.audioUrl}`);
        lines.push(`\n👉 Please open your Checklist page and mark completed upon verification.`);
        return lines.join('\n');
    },

    maintenanceTask: (raw) => {
        const d = normalizeTaskData(raw);
        const lines = [
            `🛠️ *MAINTENANCE TASK ASSIGNED*\n`,
            `Hello *${d.doerName}*, a maintenance task has been scheduled for you:\n`,
            `▫️ *Task ID:* #${d.taskId}`,
            `▫️ *Machine:* ${d.machineName || 'General Equipment'}`,
            `▫️ *Part:* ${d.partName || 'Standard'}`
        ];
        if (d.partArea) lines.push(`▫️ *Area:* ${d.partArea}`);
        if (d.department) lines.push(`▫️ *Department:* ${d.department}`);
        lines.push(`▫️ *Assigned By:* ${d.givenBy}`);
        lines.push(`▫️ *Scheduled Date:* ${d.startDate || 'Immediate'}`);
        lines.push(`\n📝 *Maintenance Description:*\n${d.description}`);
        if (d.audioUrl) lines.push(`\n🎧 *Audio Note:* ${d.audioUrl}`);
        lines.push(`\n👉 Please complete the procedure and submit the maintenance log.`);
        return lines.join('\n');
    },

    repairTask: (raw) => {
        const d = normalizeTaskData(raw);
        const lines = [
            `🔧 *BREAKDOWN / REPAIR TASK*\n`,
            `Hello *${d.doerName}*, a machine repair request has been assigned to you:\n`,
            `▫️ *Ticket ID:* #${d.taskId}`,
            `▫️ *Machine Name:* ${d.machineName || 'Equipment'}`,
            `▫️ *Reported By:* ${d.givenBy}`,
            `▫️ *Reported Time:* ${d.startDate || 'Just now'}`
        ];
        lines.push(`\n⚠️ *Issue Breakdown:*\n${d.description}`);
        if (d.audioUrl) lines.push(`\n🎧 *Audio Explanation:* ${d.audioUrl}`);
        lines.push(`\n👉 Please attend to the machine urgently and submit repair status.`);
        return lines.join('\n');
    },

    eaTask: (raw) => {
        const d = normalizeTaskData(raw);
        const lines = [
            `💼 *EXECUTIVE ASSISTANT (EA) TASK*\n`,
            `Hello *${d.doerName}*, an executive task has been assigned:\n`,
            `▫️ *Task ID:* #${d.taskId}`,
            `▫️ *Assigned By:* ${d.givenBy}`,
            `▫️ *Planned Date:* ${d.startDate || 'As scheduled'}`
        ];
        if (d.duration) lines.push(`▫️ *Estimated Duration:* ${d.duration} mins`);
        lines.push(`\n📝 *Task Details:*\n${d.description}`);
        if (d.audioUrl) lines.push(`\n🎧 *Audio Note:* ${d.audioUrl}`);
        lines.push(`\n👉 Please track and execute this task as planned.`);
        return lines.join('\n');
    },

    delegationTask: (raw) => {
        const d = normalizeTaskData(raw);
        const lines = [
            `🤝 *DELEGATED TASK ASSIGNED*\n`,
            `Hello *${d.doerName}*, a task has been delegated to you:\n`,
            `▫️ *Task ID:* #${d.taskId}`,
            `▫️ *Delegated By:* ${d.givenBy}`,
            `▫️ *Target Date:* ${d.startDate || d.dueDate || 'As scheduled'}`
        ];
        if (d.department) lines.push(`▫️ *Department:* ${d.department}`);
        if (d.duration) lines.push(`▫️ *Duration:* ${d.duration} mins`);
        lines.push(`\n📝 *Description:*\n${d.description}`);
        if (d.audioUrl) lines.push(`\n🎧 *Audio Instruction:* ${d.audioUrl}`);
        lines.push(`\n👉 Please review and prioritize this in your delegation list.`);
        return lines.join('\n');
    },

    taskExtension: (raw) => {
        const d = normalizeTaskData(raw);
        const lines = [
            `⏳ *TASK DEADLINE EXTENDED*\n`,
            `The deadline for the following task has been updated:\n`,
            `▫️ *Task ID:* #${d.taskId}`,
            `▫️ *Assignee:* ${d.doerName}`,
            `▫️ *Assigned By:* ${d.givenBy}`,
            `▫️ *New Target Date:* ${d.nextExtendDate || 'Extended'}`
        ];
        lines.push(`\n📝 *Task Description:*\n${d.description}`);
        lines.push(`\n🔔 Please ensure the task is completed before the revised deadline.`);
        return lines.join('\n');
    },

    adminExtensionRemark: (raw) => {
        const d = normalizeTaskData(raw);
        const lines = [
            `💬 *ADMIN REMARK ON EXTENSION*\n`,
            `Hello *${d.doerName}*, the Admin has reviewed your task extension request:\n`,
            `▫️ *Task ID:* #${d.taskId}`,
            `▫️ *Task:* ${d.description}\n`,
            `💬 *Admin's Remark:*`,
            `"${d.remark || 'No remark entered'}"`
        ];
        lines.push(`\n👉 Please review this remark and update your task accordingly.`);
        return lines.join('\n');
    },

    taskRejection: (raw) => {
        const d = normalizeTaskData(raw);
        const lines = [
            `❌ *TASK SUBMISSION REJECTED*\n`,
            `Hello *${d.doerName}*, your task completion submission was not approved:\n`,
            `▫️ *Task ID:* #${d.taskId}`,
            `▫️ *Module:* ${d.taskType ? String(d.taskType).toUpperCase() : 'TASK'}`,
            `▫️ *Task:* ${d.description}\n`,
            `❗ *Reason for Rejection:*`,
            `"${d.reason || d.remark || 'Corrections required'}"`
        ];
        lines.push(`\n🔄 Please rectify the issues noted above and resubmit for verification.`);
        return lines.join('\n');
    },

    taskReassignment: (raw) => {
        const d = normalizeTaskData(raw);
        const lines = [
            `🔄 *TASK REASSIGNED (LEAVE COVERAGE)*\n`,
            `Hello *${d.newDoerName || d.doerName}*, a task has been reassigned to you:\n`,
            `▫️ *Task ID:* #${d.taskId}`,
            `▫️ *Previous Assignee:* ${d.originalDoerName || 'Colleague on leave'}`,
            `▫️ *Assigned By:* ${d.givenBy}`,
            `▫️ *Target / Start Date:* ${d.startDate || 'N/A'}`
        ];
        if (d.taskType) lines.push(`▫️ *Module:* ${String(d.taskType).toUpperCase()}`);
        if (d.department) lines.push(`▫️ *Department:* ${d.department}`);
        lines.push(`\n📝 *Description:*\n${d.description}`);
        lines.push(`\n👉 Please take over this task and ensure timely completion.`);
        return lines.join('\n');
    },

    passwordResetOTP: (username, otp) => {
        return [
            `🔐 *PASSWORD RESET VERIFICATION*\n`,
            `A password reset request was initiated for username: *${username || 'User'}*\n`,
            `Your One-Time Password (OTP) is:`,
            `🔑 *${otp}*\n`,
            `⏱️ This OTP is valid for 10 minutes.`,
            `⚠️ If you did not request this code, please inform the administrator immediately.`
        ].join('\n');
    },

    taskReminder: (raw) => {
        const d = normalizeTaskData(raw);
        const lines = [
            `⏰ *TASK REMINDER*\n`,
            `Hello *${d.doerName}*, this is a reminder for your upcoming task:\n`,
            `▫️ *Task ID:* #${d.taskId}`,
            `▫️ *Assigned By:* ${d.givenBy}`,
            `▫️ *Due Date:* ${d.dueDate || d.startDate || 'Upcoming'}`
        ];
        lines.push(`\n📝 *Description:*\n${d.description}`);
        lines.push(`\n👉 Please ensure timely submission on your dashboard.`);
        return lines.join('\n');
    },

    taskCompletion: (raw) => {
        const d = normalizeTaskData(raw);
        const lines = [
            `✅ *TASK COMPLETED*\n`,
            `Hello *${d.givenBy}*, a task has been marked as completed:\n`,
            `▫️ *Task ID:* #${d.taskId}`,
            `▫️ *Completed By:* ${d.doerName}`,
            `▫️ *Module:* ${d.taskType ? String(d.taskType).toUpperCase() : 'TASK'}`,
            `▫️ *Completed On:* ${d.completionDate || new Date().toLocaleDateString('en-IN')}`
        ];
        lines.push(`\n📝 *Description:*\n${d.description}`);
        lines.push(`\n👉 Please review and approve on the Admin Approval portal.`);
        return lines.join('\n');
    }
};

// ============================================================================
// RECIPIENT RESOLUTION HELPERS
// ============================================================================

/**
 * Extracts the recipient identifier (phone number or user name) from any task object
 */
const extractDoerRecipient = (details = {}) => {
    return (
        details.phone ||
        details.phoneNumber ||
        details.phone_number ||
        details.number ||
        details.doerName ||
        details.doer_name ||
        details.assigned_person ||
        details.name ||
        details.user_name ||
        details.username ||
        details.newDoerName ||
        'User'
    );
};

const extractAssignerRecipient = (details = {}) => {
    return (
        details.phone ||
        details.phoneNumber ||
        details.phone_number ||
        details.number ||
        details.givenBy ||
        details.given_by ||
        details.filled_by ||
        'Admin'
    );
};

// ============================================================================
// EXPORTED SERVICE FUNCTIONS
// ============================================================================

/**
 * 1. Send Urgent Task Escalation Notification
 */
export const sendUrgentTaskNotification = async (details) => {
    const recipient = extractDoerRecipient(details);
    const targetPhone = await resolvePhoneNumber(recipient);
    const message = TEMPLATES.urgentTask(details);
    return sendMaytapiMessage({ to: targetPhone, message });
};

/**
 * 2. Send Task Extension Notification
 */
export const sendTaskExtensionNotification = async (details) => {
    const recipient = extractDoerRecipient(details);
    const targetPhone = await resolvePhoneNumber(recipient);
    const message = TEMPLATES.taskExtension(details);
    return sendMaytapiMessage({ to: targetPhone, message });
};

/**
 * 3. Send Task Assignment Notification (General)
 */
export const sendTaskAssignmentNotification = async (details) => {
    const recipient = extractDoerRecipient(details);
    const targetPhone = await resolvePhoneNumber(recipient);
    const message = TEMPLATES.taskAssignment(details);
    return sendMaytapiMessage({ to: targetPhone, message });
};

/**
 * 4. Send Checklist Task Notification
 */
export const sendChecklistTaskNotification = async (details) => {
    const recipient = extractDoerRecipient(details);
    const targetPhone = await resolvePhoneNumber(recipient);
    const message = TEMPLATES.checklistTask(details);
    return sendMaytapiMessage({ to: targetPhone, message });
};

/**
 * 5. Send Maintenance Task Notification
 */
export const sendMaintenanceTaskNotification = async (details) => {
    const recipient = extractDoerRecipient(details);
    const targetPhone = await resolvePhoneNumber(recipient);
    const message = TEMPLATES.maintenanceTask(details);
    return sendMaytapiMessage({ to: targetPhone, message });
};

/**
 * 6. Send Repair Task Notification
 */
export const sendRepairTaskNotification = async (details) => {
    const recipient = extractDoerRecipient(details);
    const targetPhone = await resolvePhoneNumber(recipient);
    const message = TEMPLATES.repairTask(details);
    return sendMaytapiMessage({ to: targetPhone, message });
};

/**
 * 7. Send EA (Executive Assistant) Task Notification
 */
export const sendEATaskNotification = async (details) => {
    const recipient = extractDoerRecipient(details);
    const targetPhone = await resolvePhoneNumber(recipient);
    const message = TEMPLATES.eaTask(details);
    return sendMaytapiMessage({ to: targetPhone, message });
};

/**
 * 8. Send Delegation Task Notification
 */
export const sendDelegationTaskNotification = async (details) => {
    const recipient = extractDoerRecipient(details);
    const targetPhone = await resolvePhoneNumber(recipient);
    const message = TEMPLATES.delegationTask(details);
    return sendMaytapiMessage({ to: targetPhone, message });
};

/**
 * 9. Send Task Reminder Notification
 */
export const sendTaskReminderNotification = async (details) => {
    const recipient = extractDoerRecipient(details);
    const targetPhone = await resolvePhoneNumber(recipient);
    const message = TEMPLATES.taskReminder(details);
    return sendMaytapiMessage({ to: targetPhone, message });
};

/**
 * 10. Send Task Completion Notification (To Assigner or Admin)
 */
export const sendTaskCompletionNotification = async (details) => {
    const recipient = extractAssignerRecipient(details);
    const targetPhone = await resolvePhoneNumber(recipient);
    const message = TEMPLATES.taskCompletion(details);
    return sendMaytapiMessage({ to: targetPhone, message });
};

/**
 * 11. Send Task Rejection Notification
 */
export const sendTaskRejectionNotification = async (details) => {
    const recipient = extractDoerRecipient(details);
    const targetPhone = await resolvePhoneNumber(recipient);
    const message = TEMPLATES.taskRejection(details);
    return sendMaytapiMessage({ to: targetPhone, message });
};

/**
 * 12. Send Task Reassignment Notification (Leave coverage)
 */
export const sendTaskReassignmentNotification = async (details) => {
    const recipient = details.phone || details.phoneNumber || details.phone_number || details.number || details.newDoerName || 'User';
    const targetPhone = await resolvePhoneNumber(recipient);
    const message = TEMPLATES.taskReassignment(details);
    return sendMaytapiMessage({ to: targetPhone, message });
};

/**
 * 13. Send Password Reset OTP
 */
export const sendPasswordResetOTP = async (username, otp) => {
    // Attempt lookup for user's phone in users.number, or fallback to Admin number
    const targetPhone = (await resolvePhoneNumber(username)) || formatPhoneNumber(ADMIN_WHATSAPP_NUMBER);
    const message = TEMPLATES.passwordResetOTP(username, otp);
    return sendMaytapiMessage({ to: targetPhone, message });
};

/**
 * 14. Send Admin Extension Remark Notification
 */
export const sendAdminExtensionRemarkNotification = async (details) => {
    const recipient = extractDoerRecipient(details);
    const targetPhone = await resolvePhoneNumber(recipient);
    const message = TEMPLATES.adminExtensionRemark(details);
    return sendMaytapiMessage({ to: targetPhone, message });
};

export default {
    sendUrgentTaskNotification,
    sendTaskExtensionNotification,
    sendTaskAssignmentNotification,
    sendChecklistTaskNotification,
    sendMaintenanceTaskNotification,
    sendRepairTaskNotification,
    sendEATaskNotification,
    sendDelegationTaskNotification,
    sendTaskReminderNotification,
    sendTaskCompletionNotification,
    sendTaskRejectionNotification,
    sendTaskReassignmentNotification,
    sendPasswordResetOTP,
    sendAdminExtensionRemarkNotification
};
