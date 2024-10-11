#!/bin/sh
fw="/sbin/ipfw -qf"

$fw nat 1 config ip 10.20.20.20 unreg_only \
    redirect_port tcp 192.168.64.26:1001 1002 $(: beaver-web-a1-l61.a1.example.com ) \
    redirect_port tcp 192.168.64.26:655 1003  $(: beaver-tinc-a1-l61.a1.example.com ) \
    redirect_port udp 192.168.64.26:655 1003  $(: beaver-tinc-a1-l61.a1.example.com ) \
    redirect_port tcp 192.168.64.26:53 1053   $(: type-unix-a1-l61.a1.example.com ) \
    redirect_port udp 192.168.64.26:53 1053   $(: type-unix-a1-l61.a1.example.com ) \
    redirect_port tcp 192.168.64.26:82 1082   $(: type-unix-a1-l61.a1.example.com ) \
    redirect_port udp 192.168.64.26:82 1082   $(: type-unix-a1-l61.a1.example.com ) \
    redirect_port tcp 192.168.64.26:27 1022   $(: type-unix-a1-l61.a1.example.com ) \
    redirect_port tcp 192.168.64.26:80 1080   $(: type-unix-a1-l61.a1.example.com ) \
    redirect_port tcp 192.168.64.26:443 1443  $(: type-unix-a1-l61.a1.example.com ) \
    redirect_port tcp 127.0.0.1:1001 2002     $(: beaver-web-a1-l62.a1.example.com ) \
    redirect_port tcp 127.0.0.1:655 2003      $(: beaver-tinc-a1-l62.a1.example.com ) \
    redirect_port udp 127.0.0.1:655 2003      $(: beaver-tinc-a1-l62.a1.example.com ) \
    redirect_port tcp 127.0.0.1:53 2053       $(: type-unix-a1-l62.a1.example.com ) \
    redirect_port udp 127.0.0.1:53 2053       $(: type-unix-a1-l62.a1.example.com ) \
    redirect_port tcp 127.0.0.1:82 2082       $(: type-unix-a1-l62.a1.example.com ) \
    redirect_port udp 127.0.0.1:82 2082       $(: type-unix-a1-l62.a1.example.com ) \
    redirect_port tcp 127.0.0.1:27 2022       $(: type-unix-a1-l62.a1.example.com ) \
    redirect_port tcp 127.0.0.1:80 2080       $(: type-unix-a1-l62.a1.example.com ) \
    redirect_port tcp 127.0.0.1:443 2443      $(: type-unix-a1-l62.a1.example.com ) \
    redirect_port tcp 192.168.64.26:1001 3002 $(: beaver-web-a1-l61.a1.example.org ) \
    redirect_port tcp 192.168.64.26:655 3003  $(: beaver-tinc-a1-l61.a1.example.org ) \
    redirect_port udp 192.168.64.26:655 3003  $(: beaver-tinc-a1-l61.a1.example.org ) \
    redirect_port tcp 192.168.64.26:53 3053   $(: type-unix-a1-l61.a1.example.org ) \
    redirect_port udp 192.168.64.26:53 3053   $(: type-unix-a1-l61.a1.example.org ) \
    redirect_port tcp 192.168.64.26:82 3082   $(: type-unix-a1-l61.a1.example.org ) \
    redirect_port udp 192.168.64.26:82 3082   $(: type-unix-a1-l61.a1.example.org ) \
    redirect_port tcp 192.168.64.26:27 3022   $(: type-unix-a1-l61.a1.example.org ) \
    redirect_port tcp 192.168.64.26:80 3080   $(: type-unix-a1-l61.a1.example.org ) \
    redirect_port tcp 192.168.64.26:443 3443  $(: type-unix-a1-l61.a1.example.org ) \
    redirect_port tcp 192.168.64.27:1001 4002 $(: beaver-web-a1-l64.a1.example.org ) \
    redirect_port tcp 192.168.64.27:655 4003  $(: beaver-tinc-a1-l64.a1.example.org ) \
    redirect_port udp 192.168.64.27:655 4003  $(: beaver-tinc-a1-l64.a1.example.org ) \
    redirect_port tcp 192.168.64.27:53 4053   $(: type-unix-a1-l64.a1.example.org ) \
    redirect_port udp 192.168.64.27:53 4053   $(: type-unix-a1-l64.a1.example.org ) \
    redirect_port tcp 192.168.64.27:82 4082   $(: type-unix-a1-l64.a1.example.org ) \
    redirect_port udp 192.168.64.27:82 4082   $(: type-unix-a1-l64.a1.example.org ) \
    redirect_port tcp 192.168.64.27:27 4022   $(: type-unix-a1-l64.a1.example.org ) \
    redirect_port tcp 192.168.64.27:80 4080   $(: type-unix-a1-l64.a1.example.org ) \
    redirect_port tcp 192.168.64.27:443 4443  $(: type-unix-a1-l64.a1.example.org )

: | $fw /dev/stdin <<- EOF
    set disable 2
    delete set 2


    set 2 table tinc-tap-l6-hosts-remote create or-flush
    


    set 2 table tinc-tap-l6-hosts-local create or-flush
    set 2 table tinc-tap-l6-hosts-local add 172.16.3.1 			 #   net: l61.a1.example.com
    set 2 table tinc-tap-l6-hosts-local add 172.16.3.2 			 #   net: l62.a1.example.com
    set 2 table tinc-tap-l6-hosts-local add 172.16.3.1 			 #   net: l61.a1.example.org

    set 2 table custom-table create or-flush
    set 2 table custom-table add 192.168.64.26/32                  # [Location(a1)]: [Router(l61.a1.example.com)]: WAN3
    set 2 table custom-table add 2001:db8:abcd:1234:c000::1001/128 # [Location(a1)]: [Router(l61.a1.example.com)]: WAN36
    set 2 table custom-table add 172.16.3.1/32                     # [Location(a1)]: [Router(l61.a1.example.com)]: LAN3
    set 2 table custom-table add 192.168.64.27/32                  # [Location(a1)]: [Router(l62.a1.example.com)]: WAN3
    set 2 table custom-table add 2001:db8:abcd:1234:c000::1002/128 # [Location(a1)]: [Router(l62.a1.example.com)]: WAN36
    set 2 table custom-table add 172.16.3.2/32                     # [Location(a1)]: [Router(l62.a1.example.com)]: LAN3

    set 2 table beaver-acl-table create or-flush
    set 2 table beaver-acl-table add 192.168.64.26/32                  # [Location(a1)]: [Router(l61.a1.example.org)]: WAN3
    set 2 table beaver-acl-table add 2001:db8:abcd:1234:c000::1001/128 # [Location(a1)]: [Router(l61.a1.example.com)]: WAN36
    set 2 table beaver-acl-table add 172.16.3.1/32                     # [Location(a1)]: [Router(l61.a1.example.org)]: LAN3
    set 2 table beaver-acl-table add 192.168.64.27/32                  # [Location(a1)]: [Router(l64.a1.example.org)]: WAN3
    set 2 table beaver-acl-table add 2001:db8:abcd:1234:c000::1002/128 # [Location(a1)]: [Router(l62.a1.example.com)]: WAN36
    set 2 table beaver-acl-table add 172.16.3.2/32                     # [Location(a1)]: [Router(l62.a1.example.com)]: LAN3
    set 2 table beaver-acl-table add 192.168.64.28/32                  # [Location(b1)]: [Router(l62.b1.example.com)]: WAN3
    set 2 table beaver-acl-table add 2001:db8:abcd:1234:c000::2001/128 # [Location(b1)]: [Router(l62.b1.example.com)]: WAN36
    set 2 table beaver-acl-table add 172.16.4.2/32                     # [Location(b1)]: [Router(l62.b1.example.com)]: LAN3
    set 2 table beaver-acl-table add 192.168.64.29/32                  # [Location(c1)]: [Router(l61.c1.example.com)]: WAN3
    set 2 table beaver-acl-table add 2001:db8:abcd:1234:c000::3001/128 # [Location(c1)]: [Router(l61.c1.example.com)]: WAN36
    set 2 table beaver-acl-table add 172.16.5.2/32                     # [Location(c1)]: [Router(l61.c1.example.com)]: LAN3
    set 2 table beaver-acl-table add 192.168.64.30/32                  # [Location(d1)]: [Router(l61.d1.example.com)]: WAN3
    set 2 table beaver-acl-table add 2001:db8:abcd:1234:c000::4002/128 # [Location(d1)]: [Router(l61.d1.example.com)]: WAN36
    set 2 table beaver-acl-table add 172.16.6.2/32                     # [Location(d1)]: [Router(l61.d1.example.com)]: LAN3
    set 2 table beaver-acl-table add 172.16.4.1/32                     # [Location(a1)]: [Router(l64.a1.example.org)]: LAN3
    set 2 table beaver-acl-table add 192.168.253.0/24                  # static entry: VPN WAN4
    set 2 table beaver-acl-table add 192.168.243.0/24                  # static entry: VPN WAN4
    set 2 table beaver-acl-table add 172.0.1.1/24                      # static entry

    set 2 table tinc-acl-table create or-flush
    set 2 table tinc-acl-table add 192.168.64.26/32                  # [Location(a1)]: [Router(l61.a1.example.org)]: WAN3
    set 2 table tinc-acl-table add 2001:db8:abcd:1234:c000::1001/128 # [Location(a1)]: [Router(l61.a1.example.com)]: WAN36
    set 2 table tinc-acl-table add 172.16.3.1/32                     # [Location(a1)]: [Router(l61.a1.example.org)]: LAN3
    set 2 table tinc-acl-table add 192.168.64.27/32                  # [Location(a1)]: [Router(l64.a1.example.org)]: WAN3
    set 2 table tinc-acl-table add 2001:db8:abcd:1234:c000::1002/128 # [Location(a1)]: [Router(l62.a1.example.com)]: WAN36
    set 2 table tinc-acl-table add 172.16.3.2/32                     # [Location(a1)]: [Router(l62.a1.example.com)]: LAN3
    set 2 table tinc-acl-table add 192.168.64.28/32                  # [Location(b1)]: [Router(l62.b1.example.com)]: WAN3
    set 2 table tinc-acl-table add 2001:db8:abcd:1234:c000::2001/128 # [Location(b1)]: [Router(l62.b1.example.com)]: WAN36
    set 2 table tinc-acl-table add 172.16.4.2/32                     # [Location(b1)]: [Router(l62.b1.example.com)]: LAN3
    set 2 table tinc-acl-table add 192.168.64.29/32                  # [Location(c1)]: [Router(l61.c1.example.com)]: WAN3
    set 2 table tinc-acl-table add 2001:db8:abcd:1234:c000::3001/128 # [Location(c1)]: [Router(l61.c1.example.com)]: WAN36
    set 2 table tinc-acl-table add 172.16.5.2/32                     # [Location(c1)]: [Router(l61.c1.example.com)]: LAN3
    set 2 table tinc-acl-table add 192.168.64.30/32                  # [Location(d1)]: [Router(l61.d1.example.com)]: WAN3
    set 2 table tinc-acl-table add 2001:db8:abcd:1234:c000::4002/128 # [Location(d1)]: [Router(l61.d1.example.com)]: WAN36
    set 2 table tinc-acl-table add 172.16.6.2/32                     # [Location(d1)]: [Router(l61.d1.example.com)]: LAN3
    set 2 table tinc-acl-table add 172.16.4.1/32                     # [Location(a1)]: [Router(l64.a1.example.org)]: LAN3


    add 504 set 2 allow tcp from any to me dst-port 80,443 in // public http
    add 504 set 2 allow tcp from any to me dst-port 22,27 in // management ssh
    add 504 set 2 count tcp from any to me dst-port 53 in // tcp dns
    add 504 set 2 allow ip from any to me dst-port 53 in // dns

    add 504 set 2 count ip from any to me dst-port 655 in // tinc: count all
    add 504 set 2 allow ip from table(tinc-acl-table) to me dst-port 655 in // tinc: allow specific
    add 504 set 2 deny ip from any to me dst-port 655 in // tinc: deny others

    add 504 set 2 count ip from any to me dst-port 8443 in // beaver-api: count all
    add 504 set 2 allow ip from table(beaver-acl-table) to me dst-port 8443 in // beaver-api: allow specific
    add 504 set 2 deny ip from any to me dst-port 8443 in // beaver-api: deny others

    add 508 set 2 count ip6 from me to not me out // ipv6 of all
    add 508 set 2 count udp from me to not me out // udp of all
    add 508 set 2 allow ip from me to not me out // all outgoing blindly allowed


    add 518 set 2 nat 1 ip from any to 10.20.20.20 in // incoming nat
    add 518 set 2 skipto 700 ip from 10.0.0.0/8 to 10.0.0.0/8 // local traffic
    add 518 set 2 skipto 700 ip from 172.16.0.0/12 to 172.16.0.0/12 // local traffic
    add 518 set 2 skipto 700 ip from 192.168.0.0/16 to 192.168.0.0/16 // local traffic


    add 608 set 2 nat 1 ip from 10.0.0.0/8 to any out // outgoing nat
    add 608 set 2 nat 1 ip from 172.16.0.0/12 to any out // outgoing nat
    add 608 set 2 nat 1 ip from 192.168.0.0/16 to any out // outgoing nat


    add 800 set 2 deny icmp from me to table(tinc-tap-l6-hosts-local) icmptype 5 in // block redirects for tincd
    


    add 900 set 2 count ip6 from any to any // ipv6 of all
    add 900 set 2 count ip from not me to me in // incoming of all
    add 900 set 2 allow ip from any to any // all traffic blindly allowed

    set swap 2 1
    set enable 1
    delete set 2
EOF
