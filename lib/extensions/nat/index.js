import natdModule from './natd.js';
import ipfwModule from './ipfw.js';
import ipnatModule from './ipnat.js';
import iptablesModule from './iptables.js';
export default {
    natd: natdModule,
    ipfw: ipfwModule,
    ipnat: ipnatModule,
    iptables: iptablesModule,
};
