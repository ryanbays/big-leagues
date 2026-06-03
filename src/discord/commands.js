const { SERVICES } = require('../constants');

const commands = [
    {
        name: 'ping',
        description: 'Replies with pong'
    },
    {
        name: 'panel',
        description: 'Open UK SMS panel with service dropdown and generate button',
        default_member_permissions: '32',
        options: [
            {
                name: 'maxprice',
                type: 10,
                description: 'Max price',
                required: true
            }
        ]
    },
    {
        name: 'buyuk',
        description: 'Direct buy UK number and check OTP',
        default_member_permissions: '32',
        options: [
            {
                name: 'service',
                description: 'Choose service',
                type: 3,
                required: true,
                choices: [
                    { name: SERVICES.uberPostmates.label, value: SERVICES.uberPostmates.id },
                    { name: SERVICES.greggs.label, value: SERVICES.greggs.id }
                ]
            },
            {
                name: 'maxprice',
                type: 10,
                description: 'Max price (optional)',
                required: true
            }
        ]
    },
    {
        name: 'history',
        description: 'View order history and spending stats',
        default_member_permissions: '32',
        options: [
            {
                name: 'spend',
                description: 'View spending summary for a user',
                type: 1,
                options: [
                    {
                        name: 'user',
                        description: 'User ID (defaults to yourself)',
                        type: 3,
                        required: false
                    }
                ]
            },
            {
                name: 'list',
                description: 'List filtered order history',
                type: 1,
                options: [
                    {
                        name: 'from',
                        description: 'Start date/time filter',
                        type: 3,
                        required: false
                    },
                    {
                        name: 'to',
                        description: 'End date/time filter',
                        type: 3,
                        required: false
                    },
                    {
                        name: 'service',
                        description: 'Service ID filter',
                        type: 3,
                        required: false
                    },
                    {
                        name: 'minprice',
                        description: 'Minimum price filter',
                        type: 10,
                        required: false
                    },
                    {
                        name: 'maxprice',
                        description: 'Maximum price filter',
                        type: 10,
                        required: false
                    },
                    {
                        name: 'user',
                        description: 'User ID filter',
                        type: 3,
                        required: false
                    },
                    {
                        name: 'limit',
                        description: 'Max results (1–200)',
                        type: 4,
                        required: false
                    }
                ]
            }
        ]
    }
];

module.exports = {
    commands
};
