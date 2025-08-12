require('dotenv').config();
const { classes } = require('./classes');

//script that counts how many classes for each student I gave, with pending, cancelations, and late cancelations counted

const countClassStatsByParticipant = () => {
  const summary = {};

  classes.forEach(({ participantName, classStatus, classCancellation, plannedDuration, classType }) => {
    const name = participantName;
    const status = classStatus;
    const isLate = classCancellation?.cancellationTiming === "Late";
    const typeKey = classType === 'In-person' ? 'inPerson' : 'virtual';

    if (!summary[name]) {
      summary[name] = {
        held: { inPerson: 0, virtual: 0 },
        cancelled: { inPerson: 0, virtual: 0 },
        lateCancelled: { inPerson: 0, virtual: 0 },
        pending: { inPerson: 0, virtual: 0 }
      };
    }

    if (status === "Held") {
      summary[name].held[typeKey] += plannedDuration;
    } else if (status === "Cancelled") {
      if (isLate) {
        summary[name].lateCancelled[typeKey] += classCancellation?.durationCancelled || 0;
      } else {
        summary[name].cancelled[typeKey] += classCancellation?.durationCancelled || 0;
      }
    } else if (status === "Pending") {
      summary[name].pending[typeKey] += plannedDuration;
    }
  });

  return summary;
}

console.log(countClassStatsByParticipant());



const getFullSummaryByParticipant = () => {
  const result = {};

  classes.forEach(({ participantName, classStatus, classCancellation, plannedDuration, dateTime, classType }) => {
    const name = participantName;
    const isLate = classCancellation?.cancellationTiming === "Late";
    const status = classStatus === "Cancelled" ? (isLate ? "CancelledLate" : "Cancelled") : classStatus;
    const duration = classStatus === "Cancelled" ? classCancellation?.durationCancelled || 0 : plannedDuration;

    if (!result[name]) result[name] = [];

    result[name].push({
      date: dateTime,
      duration,
      status,
      type: classType
    });
  });

  for (const name in result) {
    result[name].sort((a, b) => new Date(a.date) - new Date(b.date));
  }

  return result;
};

console.log(JSON.stringify(getFullSummaryByParticipant(), null, 2));
