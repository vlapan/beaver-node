#!/bin/sh
fw="/sbin/ipfw -qf"


#${fw} nat 1 delete #
${fw} nat 1 config ip 10.20.20.20 unreg_only \
    redirect_port tcp 192.168.64.26:1001 1002 $(true || comment beaver-web-a1-l61.a1.example.com) \
    redirect_port tcp 192.168.64.26:655 1003 $(true || comment beaver-tinc-a1-l61.a1.example.com) \
    redirect_port udp 192.168.64.26:655 1003 $(true || comment beaver-tinc-a1-l61.a1.example.com) \
    redirect_port tcp 192.168.64.26:53 1053 $(true || comment type-unix-a1-l61.a1.example.com) \
    redirect_port udp 192.168.64.26:53 1053 $(true || comment type-unix-a1-l61.a1.example.com) \
    redirect_port tcp 192.168.64.26:82 1082 $(true || comment type-unix-a1-l61.a1.example.com) \
    redirect_port udp 192.168.64.26:82 1082 $(true || comment type-unix-a1-l61.a1.example.com) \
    redirect_port tcp 192.168.64.26:27 1022 $(true || comment type-unix-a1-l61.a1.example.com) \
    redirect_port tcp 192.168.64.26:80 1080 $(true || comment type-unix-a1-l61.a1.example.com) \
    redirect_port tcp 192.168.64.26:443 1443 $(true || comment type-unix-a1-l61.a1.example.com) \
    redirect_port tcp 127.0.0.1:1001 2002 $(true || comment beaver-web-a1-l62.a1.example.com) \
    redirect_port tcp 127.0.0.1:655 2003 $(true || comment beaver-tinc-a1-l62.a1.example.com) \
    redirect_port udp 127.0.0.1:655 2003 $(true || comment beaver-tinc-a1-l62.a1.example.com) \
    redirect_port tcp 127.0.0.1:53 2053 $(true || comment type-unix-a1-l62.a1.example.com) \
    redirect_port udp 127.0.0.1:53 2053 $(true || comment type-unix-a1-l62.a1.example.com) \
    redirect_port tcp 127.0.0.1:82 2082 $(true || comment type-unix-a1-l62.a1.example.com) \
    redirect_port udp 127.0.0.1:82 2082 $(true || comment type-unix-a1-l62.a1.example.com) \
    redirect_port tcp 127.0.0.1:27 2022 $(true || comment type-unix-a1-l62.a1.example.com) \
    redirect_port tcp 127.0.0.1:80 2080 $(true || comment type-unix-a1-l62.a1.example.com) \
    redirect_port tcp 127.0.0.1:443 2443 $(true || comment type-unix-a1-l62.a1.example.com) \
    redirect_port tcp 192.168.64.26:1001 3002 $(true || comment beaver-web-a1-l61.a1.example.org) \
    redirect_port tcp 192.168.64.26:655 3003 $(true || comment beaver-tinc-a1-l61.a1.example.org) \
    redirect_port udp 192.168.64.26:655 3003 $(true || comment beaver-tinc-a1-l61.a1.example.org) \
    redirect_port tcp 192.168.64.26:53 3053 $(true || comment type-unix-a1-l61.a1.example.org) \
    redirect_port udp 192.168.64.26:53 3053 $(true || comment type-unix-a1-l61.a1.example.org) \
    redirect_port tcp 192.168.64.26:82 3082 $(true || comment type-unix-a1-l61.a1.example.org) \
    redirect_port udp 192.168.64.26:82 3082 $(true || comment type-unix-a1-l61.a1.example.org) \
    redirect_port tcp 192.168.64.26:27 3022 $(true || comment type-unix-a1-l61.a1.example.org) \
    redirect_port tcp 192.168.64.26:80 3080 $(true || comment type-unix-a1-l61.a1.example.org) \
    redirect_port tcp 192.168.64.26:443 3443 $(true || comment type-unix-a1-l61.a1.example.org) \
    redirect_port tcp 192.168.64.27:1001 4002 $(true || comment beaver-web-a1-l64.a1.example.org) \
    redirect_port tcp 192.168.64.27:655 4003 $(true || comment beaver-tinc-a1-l64.a1.example.org) \
    redirect_port udp 192.168.64.27:655 4003 $(true || comment beaver-tinc-a1-l64.a1.example.org) \
    redirect_port tcp 192.168.64.27:53 4053 $(true || comment type-unix-a1-l64.a1.example.org) \
    redirect_port udp 192.168.64.27:53 4053 $(true || comment type-unix-a1-l64.a1.example.org) \
    redirect_port tcp 192.168.64.27:82 4082 $(true || comment type-unix-a1-l64.a1.example.org) \
    redirect_port udp 192.168.64.27:82 4082 $(true || comment type-unix-a1-l64.a1.example.org) \
    redirect_port tcp 192.168.64.27:27 4022 $(true || comment type-unix-a1-l64.a1.example.org) \
    redirect_port tcp 192.168.64.27:80 4080 $(true || comment type-unix-a1-l64.a1.example.org) \
    redirect_port tcp 192.168.64.27:443 4443 $(true || comment type-unix-a1-l64.a1.example.org)


${fw} set disable 2 || true
${fw} delete set 2 || true


${fw} set 2 table tinc-tap-l6-hosts-remote create or-flush || true 			 # 5: remote



${fw} set 2 table tinc-tap-l6-hosts-local create or-flush || true 			 # 6: local
${fw} set 2 table tinc-tap-l6-hosts-local add 172.16.3.1 			 #   net: l61.a1.example.com
${fw} set 2 table tinc-tap-l6-hosts-local add 172.16.3.2 			 #   net: l62.a1.example.com
${fw} set 2 table tinc-tap-l6-hosts-local add 172.16.3.1 			 #   net: l61.a1.example.org


${fw} add 504 set 2 allow tcp from any to me dst-port 80,443 in // public http
${fw} add 504 set 2 allow tcp from any to me dst-port 22,27 in // management ssh
${fw} add 504 set 2 count tcp from any to me dst-port 53 in // tcp dns
${fw} add 504 set 2 count ip from any to me dst-port 655 in // tincd
${fw} add 504 set 2 allow ip from any to me dst-port 53,655 in // dns + tincd


${fw} add 508 set 2 count ip6 from me to not me out // ipv6 of all
${fw} add 508 set 2 count udp from me to not me out // udp of all
${fw} add 508 set 2 allow ip from me to not me out // all outgoing blindly allowed


${fw} add 518 set 2 nat 1 ip from any to 10.20.20.20 in // incoming nat
${fw} add 518 set 2 skipto 700 ip from 10.0.0.0/8 to 10.0.0.0/8 // local traffic
${fw} add 518 set 2 skipto 700 ip from 172.16.0.0/12 to 172.16.0.0/12 // local traffic
${fw} add 518 set 2 skipto 700 ip from 192.168.0.0/16 to 192.168.0.0/16 // local traffic


${fw} add 608 set 2 nat 1 ip from 10.0.0.0/8 to any out // outgoing nat
${fw} add 608 set 2 nat 1 ip from 172.16.0.0/12 to any out // outgoing nat
${fw} add 608 set 2 nat 1 ip from 192.168.0.0/16 to any out // outgoing nat


${fw} add 800 set 2 deny icmp from me to 'table(tinc-tap-l6-hosts-local)' icmptype 5 in // block redirects for tincd



${fw} add 900 set 2 count ip6 from any to any // ipv6 of all
${fw} add 900 set 2 count ip from not me to me in // incoming of all
${fw} add 900 set 2 allow ip from any to any // all traffic blindly allowed

${fw} set enable 2 || true
${fw} set swap 2 1 || true
${fw} delete set 2 || true
