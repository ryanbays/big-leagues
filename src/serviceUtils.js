const { SERVICES } = require('./constants');

function isAllowedService(serviceId) {
    const allowed = Object.values(SERVICES).map((s) => String(s.id));
    return allowed.includes(String(serviceId));
}

function serviceLabelFromId(serviceId) {
    if (serviceId === SERVICES.greggs.id) return SERVICES.greggs.label;
    if (serviceId === SERVICES.uberPostmates.id) return SERVICES.uberPostmates.label;
    return `Service ${serviceId}`;
}

module.exports = {
    isAllowedService,
    serviceLabelFromId
};
