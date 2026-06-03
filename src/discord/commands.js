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
        options: [{ name: 'maxprice', type: 10, description: 'Max price', required: true }]
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
            { name: 'maxprice', type: 10, description: 'Max price (optional)', required: true }
        ]
    }
];

module.exports = {
    commands
};
