#!/bin/sh
fw="/sbin/ipfw -qf"


#${fw} nat 1 delete #
${fw} nat 1 config if wan.4022 unreg_only \
    redirect_port tcp 192.168.64.27:1001 1002 $(true || comment beaver-web-a1-l64.a1.example.org) \
    redirect_port tcp 192.168.64.27:655 1003 $(true || comment beaver-tinc-a1-l64.a1.example.org) \
    redirect_port udp 192.168.64.27:655 1003 $(true || comment beaver-tinc-a1-l64.a1.example.org) \
    redirect_port tcp 192.168.64.27:53 1053 $(true || comment type-unix-a1-l64.a1.example.org) \
    redirect_port udp 192.168.64.27:53 1053 $(true || comment type-unix-a1-l64.a1.example.org) \
    redirect_port tcp 192.168.64.27:82 1082 $(true || comment type-unix-a1-l64.a1.example.org) \
    redirect_port udp 192.168.64.27:82 1082 $(true || comment type-unix-a1-l64.a1.example.org) \
    redirect_port tcp 192.168.64.27:22 1022 $(true || comment type-unix-a1-l64.a1.example.org) \
    redirect_port tcp 192.168.64.27:80 1080 $(true || comment type-unix-a1-l64.a1.example.org) \
    redirect_port tcp 192.168.64.27:443 1443 $(true || comment type-unix-a1-l64.a1.example.org)


${fw} set disable 2 || true
${fw} delete set 2 || true


${fw} set 2 table 5 flush || true 			 # 5: remote
${fw} set 2 table 5 add 172.16.4.2 10.254.2.2 	 #   net: l62.b1.example.com


${fw} set 2 table 6 flush || true 			 # 6: local
${fw} set 2 table 6 add 172.16.3.1 			 #   net: l61.a1.example.com
${fw} set 2 table 6 add 172.16.3.2 			 #   net: l62.a1.example.com
${fw} set 2 table 6 add 172.16.3.1 			 #   net: l61.a1.example.org


${fw} add 504 set 2 allow tcp from any to me dst-port 80,443 in // public http
${fw} add 504 set 2 allow tcp from any to me dst-port 22,27 in // management ssh
${fw} add 504 set 2 count tcp from any to me dst-port 53 in // tcp dns
${fw} add 504 set 2 count ip from any to me dst-port 655 in // tincd
${fw} add 504 set 2 allow ip from any to me dst-port 53,655 in // dns + tincd


${fw} add 508 set 2 count ip6 from me to not me out // ipv6 of all
${fw} add 508 set 2 count udp from me to not me out // udp of all
${fw} add 508 set 2 allow ip from me to not me out // all outgoing blindly allowed


${fw} add 518 set 2 nat 1 ip from any to 10.20.20.20 in recv wan.4022 // incoming nat
${fw} add 518 set 2 skipto 700 ip from 10.0.0.0/8 to 10.0.0.0/8 // local traffic
${fw} add 518 set 2 skipto 700 ip from 172.16.0.0/12 to 172.16.0.0/12 // local traffic
${fw} add 518 set 2 skipto 700 ip from 192.168.0.0/16 to 192.168.0.0/16 // local traffic


${fw} add 608 set 2 nat 1 ip from 10.0.0.0/8 to any out xmit wan.4022 // outgoing nat
${fw} add 608 set 2 nat 1 ip from 172.16.0.0/12 to any out xmit wan.4022 // outgoing nat
${fw} add 608 set 2 nat 1 ip from 192.168.0.0/16 to any out xmit wan.4022 // outgoing nat


${fw} add 800 set 2 deny icmp from me to 'table(6)' icmptype 5 in // block redirects for tincd



${fw} add 900 set 2 count ip6 from any to any // ipv6 of all
${fw} add 900 set 2 count ip from not me to me in // incoming of all
${fw} add 900 set 2 allow ip from any to any // all traffic blindly allowed

${fw} set enable 2 || true
${fw} set swap 2 1 || true
${fw} delete set 2 || true
