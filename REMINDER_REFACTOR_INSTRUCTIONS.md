# Reminder Recipients Refactor - Remaining Work

## Completed ✅
1. **Database Migration** - Created `database_migrations/add_per_reminder_recipients.sql`
   - Adds per-reminder recipient columns to `event_reminders` table
   - Run this migration before testing

2. **EventDialog UI** - Updated `src/components/ui/events/EventDialog.tsx`
   - Added per-reminder recipient state variables
   - Updated UI to show checkboxes for each response type (Accepted, Tentative, Declined, No Response) for EACH reminder
   - Recipients only shown when reminder is enabled
   - Updated save handler to pass new recipient structure

3. **Roster Management UI Improvements**
   - Moved "Sync with Discord" button to Pilot List footer
   - Removed "Roster" header
   - Adjusted spacing to match other pages

4. **Mission Preparation UI Fix**
   - Fixed Flight Assignments footer height to match Available Pilots footer

## Remaining Tasks 📋

### Task 1: Update Backend Event Creation/Update
**File:** `server/index.js` (likely around event creation/update endpoints)

**What to do:**
1. Find the endpoint that handles event creation/update (likely `/api/events` POST/PUT)
2. Update the code that saves reminder data to event_reminders table
3. Current code likely saves reminders with settings like:
   ```javascript
   // Old way (event-level recipients)
   const { sendRemindersToAccepted, sendRemindersToTentative } = eventSettings;
   ```
4. Change to save per-reminder recipients:
   ```javascript
   // New way (per-reminder recipients)
   const firstReminderRecipients = reminders.firstReminder?.recipients || {
     accepted: true,
     tentative: true,
     declined: false,
     noResponse: false
   };
   const secondReminderRecipients = reminders.secondReminder?.recipients || {
     accepted: true,
     tentative: true,
     declined: false,
     noResponse: false
   };

   // When inserting/updating event_reminders records:
   await supabase.from('event_reminders').insert({
     event_id: eventId,
     reminder_type: 'first',
     scheduled_time: firstReminderTime,
     notify_accepted: firstReminderRecipients.accepted,
     notify_tentative: firstReminderRecipients.tentative,
     notify_declined: firstReminderRecipients.declined,
     notify_no_response: firstReminderRecipients.noResponse,
     sent: false
   });
   ```

### Task 2: Update Reminder Processing Logic
**File:** `server/index.js` - Function `processIndividualReminder` (around line 1707)

**Current behavior (lines 1736-1740):**
```javascript
const { data: attendanceData, error: attendanceError } = await supabase
  .from('discord_event_attendance')
  .select('discord_id, discord_username, user_response')
  .in('discord_event_id', discordEventIds)
  .in('user_response', ['accepted', 'tentative']);
```

**What to do:**
1. Read the reminder recipients settings from the reminder record itself
2. Build the query filter dynamically based on what response types should be notified
3. Example:
   ```javascript
   // Get reminder with recipient settings
   const { data: reminderData } = await supabase
     .from('event_reminders')
     .select('*')
     .eq('id', reminder.id)
     .single();

   // Build response types array based on reminder settings
   const responseTypes = [];
   if (reminderData.notify_accepted) responseTypes.push('accepted');
   if (reminderData.notify_tentative) responseTypes.push('tentative');
   if (reminderData.notify_declined) responseTypes.push('declined');

   // If notify_no_response is true, need special handling to find users WITHOUT responses
   let attendanceData = [];

   if (responseTypes.length > 0) {
     const { data } = await supabase
       .from('discord_event_attendance')
       .select('discord_id, discord_username, user_response')
       .in('discord_event_id', discordEventIds)
       .in('user_response', responseTypes);
     attendanceData = data || [];
   }

   // Handle no_response case (users who haven't responded)
   if (reminderData.notify_no_response) {
     // Need to get all eligible pilots and filter out those who have responded
     // This requires joining with pilots table and filtering by active status
     // See implementation details below
   }
   ```

4. **Important:** Only notify users with **Active status** in the pilots table
   - Add a join or additional query to filter by pilot status
   - Check `pilots.currentStatus.isActive === true`

### Task 3: Disable Response Changes After Event Conclusion
**Files:**
- Frontend event display components (wherever users can change their response)
- `SDOBot/discordBot.js` - Button interaction handlers

**Frontend:**
1. Find components that display event response buttons
2. Add logic to check if event has concluded:
   ```typescript
   const eventHasConcluded = event.end_datetime && new Date(event.end_datetime) < new Date();
   ```
3. Disable or hide response buttons if `eventHasConcluded === true`

**Discord Bot:**
1. In button interaction handlers, check if event has concluded before allowing response changes
2. Return error message: "This event has concluded. Response changes are no longer allowed."

### Task 4: Remove Discord Response Buttons After Event Completion
**File:** `SDOBot/discordBot.js` and/or `server/index.js`

**Approach:** Piggyback on existing reminder processing

**What to do:**
1. In the `processReminders()` function or similar, after an event concludes:
   - Check if event end_datetime has passed
   - If so, fetch the Discord message for the event
   - Edit the message to remove interactive buttons
   - Keep the message content but replace buttons with static text like "Event concluded"

2. Example (pseudo-code):
   ```javascript
   // After event ends (could be in reminder processor or separate job)
   if (eventEndTime < now) {
     // Get Discord message
     const discordEventIds = eventData.discord_event_id;

     for (const publication of discordEventIds) {
       const channel = await client.channels.fetch(publication.channelId);
       const message = await channel.messages.fetch(publication.messageId);

       // Edit message to remove buttons
       await message.edit({
         components: [] // Remove all interactive components
       });

       // Optionally add a footer text: "This event has concluded"
     }
   }
   ```

3. Consider adding this as part of the reminder processor's event check loop
   - Already runs every 60 seconds
   - Can check for concluded events alongside pending reminders

## Testing Checklist 🧪

After implementing remaining tasks:

1. **Create New Event with Reminders**
   - [ ] Set first reminder to notify only "No Response" users
   - [ ] Set second reminder to notify "Accepted" and "Tentative" users
   - [ ] Verify database records have correct notify_* columns

2. **Test Reminder Firing**
   - [ ] Verify first reminder goes to only no-response users
   - [ ] Verify second reminder goes to accepted + tentative users
   - [ ] Confirm declined users do NOT receive reminders
   - [ ] Confirm only ACTIVE pilots receive notifications

3. **Test Event Conclusion**
   - [ ] After event ends, verify response buttons are disabled in UI
   - [ ] After event ends, verify Discord message buttons are removed
   - [ ] Verify error message if user tries to change response after conclusion

4. **Test Legacy Events**
   - [ ] Verify events created before migration still work
   - [ ] Check that they fall back to default recipient settings

## Database Migration Notes

Remember to run the migration:
```sql
-- From database_migrations/add_per_reminder_recipients.sql
-- This adds notify_accepted, notify_tentative, notify_declined, notify_no_response
-- columns to the event_reminders table
```

The migration provides defaults that maintain backward compatibility:
- notify_accepted: true
- notify_tentative: true
- notify_declined: false
- notify_no_response: false

## Architecture Notes

**Key Design Decisions:**
1. Recipients are configured PER REMINDER (not globally)
2. Only active users are notified (enforced in processing logic, not DB)
3. All four response types are supported: accepted, tentative, declined, no_response
4. Frontend UI only shows recipient checkboxes when reminder is enabled
5. Legacy events use default settings via fallback logic
