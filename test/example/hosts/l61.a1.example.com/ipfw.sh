#!/bin/sh
fw="/sbin/ipfw -qf"


$fw nat 2 config ip 10.20.20.20 unreg_only

$fw nat 1 delete
$fw nat 1 config ip 10.20.20.20 unreg_only \
    redirect_port tcp 127.0.0.1:1001 1002     $(: beaver-web-a1-l61.a1.example.com ) \
    redirect_port tcp 127.0.0.1:655 1003      $(: beaver-tinc-a1-l61.a1.example.com ) \
    redirect_port udp 127.0.0.1:655 1003      $(: beaver-tinc-a1-l61.a1.example.com ) \
    redirect_port tcp 127.0.0.1:53 1053       $(: type-unix-a1-l61.a1.example.com ) \
    redirect_port udp 127.0.0.1:53 1053       $(: type-unix-a1-l61.a1.example.com ) \
    redirect_port tcp 127.0.0.1:82 1082       $(: type-unix-a1-l61.a1.example.com ) \
    redirect_port udp 127.0.0.1:82 1082       $(: type-unix-a1-l61.a1.example.com ) \
    redirect_port tcp 127.0.0.1:27 1022       $(: type-unix-a1-l61.a1.example.com ) \
    redirect_port tcp 127.0.0.1:80 1080       $(: type-unix-a1-l61.a1.example.com ) \
    redirect_port tcp 127.0.0.1:443 1443      $(: type-unix-a1-l61.a1.example.com ) \
    redirect_port tcp 192.168.64.27:1001 2002 $(: beaver-web-a1-l62.a1.example.com ) \
    redirect_port tcp 192.168.64.27:655 2003  $(: beaver-tinc-a1-l62.a1.example.com ) \
    redirect_port udp 192.168.64.27:655 2003  $(: beaver-tinc-a1-l62.a1.example.com ) \
    redirect_port tcp 192.168.64.27:53 2053   $(: type-unix-a1-l62.a1.example.com ) \
    redirect_port udp 192.168.64.27:53 2053   $(: type-unix-a1-l62.a1.example.com ) \
    redirect_port tcp 192.168.64.27:82 2082   $(: type-unix-a1-l62.a1.example.com ) \
    redirect_port udp 192.168.64.27:82 2082   $(: type-unix-a1-l62.a1.example.com ) \
    redirect_port tcp 192.168.64.27:27 2022   $(: type-unix-a1-l62.a1.example.com ) \
    redirect_port tcp 192.168.64.27:80 2080   $(: type-unix-a1-l62.a1.example.com ) \
    redirect_port tcp 192.168.64.27:443 2443  $(: type-unix-a1-l62.a1.example.com ) \
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
    set 2 table all destroy


    set 2 table tinc-tap-l6-hosts-remote create missing
    set 2 table tinc-tap-l6-hosts-remote-tmp create or-flush
    
    set 2 table tinc-tap-l6-hosts-remote-tmp swap tinc-tap-l6-hosts-remote
    set 2 table tinc-tap-l6-hosts-remote-tmp destroy


    set 2 table tinc-tap-l6-hosts-local create missing
    set 2 table tinc-tap-l6-hosts-local-tmp create or-flush
    set 2 table tinc-tap-l6-hosts-local-tmp add 172.16.3.1 			 #   net: l61.a1.example.com
    set 2 table tinc-tap-l6-hosts-local-tmp add 172.16.3.2 			 #   net: l62.a1.example.com
    set 2 table tinc-tap-l6-hosts-local-tmp add 172.16.3.1 			 #   net: l61.a1.example.org
    set 2 table tinc-tap-l6-hosts-local-tmp swap tinc-tap-l6-hosts-local
    set 2 table tinc-tap-l6-hosts-local-tmp destroy

    set 2 table custom-table create missing
    set 2 table custom-table-tmp create or-flush
    set 2 table custom-table-tmp add 192.168.64.26/32                  # [Location(a1)]: [Router(l61.a1.example.com)]: WAN3
    set 2 table custom-table-tmp add 2001:db8:abcd:1234:c000::1001/128 # [Location(a1)]: [Router(l61.a1.example.com)]: WAN36
    set 2 table custom-table-tmp add 172.16.3.1/32                     # [Location(a1)]: [Router(l61.a1.example.com)]: LAN3
    set 2 table custom-table-tmp add 192.168.64.27/32                  # [Location(a1)]: [Router(l62.a1.example.com)]: WAN3
    set 2 table custom-table-tmp add 2001:db8:abcd:1234:c000::1002/128 # [Location(a1)]: [Router(l62.a1.example.com)]: WAN36
    set 2 table custom-table-tmp add 172.16.3.2/32                     # [Location(a1)]: [Router(l62.a1.example.com)]: LAN3
    set 2 table custom-table-tmp swap custom-table
    set 2 table custom-table-tmp destroy

    set 2 table beaver-acl-table create missing
    set 2 table beaver-acl-table-tmp create or-flush
    set 2 table beaver-acl-table-tmp add 192.168.64.26/32                  # [Location(a1)]: [Router(l61.a1.example.org)]: WAN3
    set 2 table beaver-acl-table-tmp add 2001:db8:abcd:1234:c000::1001/128 # [Location(a1)]: [Router(l61.a1.example.com)]: WAN36
    set 2 table beaver-acl-table-tmp add 172.16.3.1/32                     # [Location(a1)]: [Router(l61.a1.example.org)]: LAN3
    set 2 table beaver-acl-table-tmp add 192.168.64.27/32                  # [Location(a1)]: [Router(l64.a1.example.org)]: WAN3
    set 2 table beaver-acl-table-tmp add 2001:db8:abcd:1234:c000::1002/128 # [Location(a1)]: [Router(l62.a1.example.com)]: WAN36
    set 2 table beaver-acl-table-tmp add 172.16.3.2/32                     # [Location(a1)]: [Router(l62.a1.example.com)]: LAN3
    set 2 table beaver-acl-table-tmp add 192.168.64.28/32                  # [Location(b1)]: [Router(l62.b1.example.com)]: WAN3
    set 2 table beaver-acl-table-tmp add 2001:db8:abcd:1234:c000::2001/128 # [Location(b1)]: [Router(l62.b1.example.com)]: WAN36
    set 2 table beaver-acl-table-tmp add 172.16.4.2/32                     # [Location(b1)]: [Router(l62.b1.example.com)]: LAN3
    set 2 table beaver-acl-table-tmp add 192.168.64.29/32                  # [Location(c1)]: [Router(l61.c1.example.com)]: WAN3
    set 2 table beaver-acl-table-tmp add 2001:db8:abcd:1234:c000::3001/128 # [Location(c1)]: [Router(l61.c1.example.com)]: WAN36
    set 2 table beaver-acl-table-tmp add 172.16.5.2/32                     # [Location(c1)]: [Router(l61.c1.example.com)]: LAN3
    set 2 table beaver-acl-table-tmp add 192.168.64.30/32                  # [Location(d1)]: [Router(l61.d1.example.com)]: WAN3
    set 2 table beaver-acl-table-tmp add 2001:db8:abcd:1234:c000::4002/128 # [Location(d1)]: [Router(l61.d1.example.com)]: WAN36
    set 2 table beaver-acl-table-tmp add 172.16.6.2/32                     # [Location(d1)]: [Router(l61.d1.example.com)]: LAN3
    set 2 table beaver-acl-table-tmp add 172.16.4.1/32                     # [Location(a1)]: [Router(l64.a1.example.org)]: LAN3
    set 2 table beaver-acl-table-tmp add 192.168.253.0/24                  # static entry: VPN WAN4
    set 2 table beaver-acl-table-tmp add 192.168.243.0/24                  # static entry: VPN WAN4
    set 2 table beaver-acl-table-tmp add 91.217.20.0/26                    # static entry
    set 2 table beaver-acl-table-tmp add 91.217.21.0/26                    # static entry
    set 2 table beaver-acl-table-tmp add 194.226.96.192/28                 # static entry
    set 2 table beaver-acl-table-tmp add 31.177.66.192/28                  # static entry
    set 2 table beaver-acl-table-tmp add 172.0.1.1/24                      # static entry
    set 2 table beaver-acl-table-tmp swap beaver-acl-table
    set 2 table beaver-acl-table-tmp destroy

    set 2 table tinc-acl-table create missing
    set 2 table tinc-acl-table-tmp create or-flush
    set 2 table tinc-acl-table-tmp add 192.168.64.26/32                  # [Location(a1)]: [Router(l61.a1.example.org)]: WAN3
    set 2 table tinc-acl-table-tmp add 2001:db8:abcd:1234:c000::1001/128 # [Location(a1)]: [Router(l61.a1.example.com)]: WAN36
    set 2 table tinc-acl-table-tmp add 172.16.3.1/32                     # [Location(a1)]: [Router(l61.a1.example.org)]: LAN3
    set 2 table tinc-acl-table-tmp add 192.168.64.27/32                  # [Location(a1)]: [Router(l64.a1.example.org)]: WAN3
    set 2 table tinc-acl-table-tmp add 2001:db8:abcd:1234:c000::1002/128 # [Location(a1)]: [Router(l62.a1.example.com)]: WAN36
    set 2 table tinc-acl-table-tmp add 172.16.3.2/32                     # [Location(a1)]: [Router(l62.a1.example.com)]: LAN3
    set 2 table tinc-acl-table-tmp add 192.168.64.28/32                  # [Location(b1)]: [Router(l62.b1.example.com)]: WAN3
    set 2 table tinc-acl-table-tmp add 2001:db8:abcd:1234:c000::2001/128 # [Location(b1)]: [Router(l62.b1.example.com)]: WAN36
    set 2 table tinc-acl-table-tmp add 172.16.4.2/32                     # [Location(b1)]: [Router(l62.b1.example.com)]: LAN3
    set 2 table tinc-acl-table-tmp add 192.168.64.29/32                  # [Location(c1)]: [Router(l61.c1.example.com)]: WAN3
    set 2 table tinc-acl-table-tmp add 2001:db8:abcd:1234:c000::3001/128 # [Location(c1)]: [Router(l61.c1.example.com)]: WAN36
    set 2 table tinc-acl-table-tmp add 172.16.5.2/32                     # [Location(c1)]: [Router(l61.c1.example.com)]: LAN3
    set 2 table tinc-acl-table-tmp add 192.168.64.30/32                  # [Location(d1)]: [Router(l61.d1.example.com)]: WAN3
    set 2 table tinc-acl-table-tmp add 2001:db8:abcd:1234:c000::4002/128 # [Location(d1)]: [Router(l61.d1.example.com)]: WAN36
    set 2 table tinc-acl-table-tmp add 172.16.6.2/32                     # [Location(d1)]: [Router(l61.d1.example.com)]: LAN3
    set 2 table tinc-acl-table-tmp add 172.16.4.1/32                     # [Location(a1)]: [Router(l64.a1.example.org)]: LAN3
    set 2 table tinc-acl-table-tmp swap tinc-acl-table
    set 2 table tinc-acl-table-tmp destroy

    set 2 table service-port-forward-access-ff5eec00 create missing
    set 2 table service-port-forward-access-ff5eec00-tmp create or-flush
    set 2 table service-port-forward-access-ff5eec00-tmp add 172.254.1.0/24    # static entry: some host
    set 2 table service-port-forward-access-ff5eec00-tmp add 192.168.253.0/24  # static entry: VPN WAN4
    set 2 table service-port-forward-access-ff5eec00-tmp add 192.168.243.0/24  # static entry: VPN WAN4
    set 2 table service-port-forward-access-ff5eec00-tmp add 91.217.20.0/26    # static entry
    set 2 table service-port-forward-access-ff5eec00-tmp add 91.217.21.0/26    # static entry
    set 2 table service-port-forward-access-ff5eec00-tmp add 194.226.96.192/28 # static entry
    set 2 table service-port-forward-access-ff5eec00-tmp add 31.177.66.192/28  # static entry
    set 2 table service-port-forward-access-ff5eec00-tmp swap service-port-forward-access-ff5eec00
    set 2 table service-port-forward-access-ff5eec00-tmp destroy

    set 2 table service-port-forward-access-7a40909f create missing
    set 2 table service-port-forward-access-7a40909f-tmp create or-flush
    set 2 table service-port-forward-access-7a40909f-tmp add 192.168.253.0/24  # static entry: VPN WAN4
    set 2 table service-port-forward-access-7a40909f-tmp add 192.168.243.0/24  # static entry: VPN WAN4
    set 2 table service-port-forward-access-7a40909f-tmp add 91.217.20.0/26    # static entry
    set 2 table service-port-forward-access-7a40909f-tmp add 91.217.21.0/26    # static entry
    set 2 table service-port-forward-access-7a40909f-tmp add 194.226.96.192/28 # static entry
    set 2 table service-port-forward-access-7a40909f-tmp add 31.177.66.192/28  # static entry
    set 2 table service-port-forward-access-7a40909f-tmp swap service-port-forward-access-7a40909f
    set 2 table service-port-forward-access-7a40909f-tmp destroy


    add 504 set 2 allow ip from any to me dst-port 80,443 in // http: allow all

    add 504 set 2 allow tcp from any to me dst-port 22,27 in // ssh: allow all

    add 504 set 2 count tcp from any to me dst-port 53 in // tcp dns
    add 504 set 2 allow ip from any to me dst-port 53 in // dns

    add 504 set 2 allow ip from table(tinc-acl-table) to me dst-port 655 in // tinc: allow specific
    add 504 set 2 deny ip from any to me dst-port 655 in // tinc: deny others

    add 504 set 2 allow ip from table(beaver-acl-table) to me dst-port 8443 in // beaver-api: allow specific
    add 504 set 2 deny ip from any to me dst-port 8443 in // beaver-api: deny others

    add 508 set 2 count ip6 from me to not me out // ipv6 of all
    add 508 set 2 count udp from me to not me out // udp of all
    add 508 set 2 allow ip from me to not me out // all outgoing blindly allowed

    set 2 table service-port-forward-target create missing type flow:proto,dst-ip,dst-port valtype tag
    set 2 table service-port-forward-target-tmp create or-flush type flow:proto,dst-ip,dst-port valtype tag
    set 2 table service-port-forward-target-tmp add tcp,10.20.20.20,1002 1001 # beaver-web-a1-l61.a1.example.com => tcp-1002
    set 2 table service-port-forward-target-tmp add tcp,10.20.20.20,1003 1001 # beaver-tinc-a1-l61.a1.example.com => tcp-1003
    set 2 table service-port-forward-target-tmp add udp,10.20.20.20,1003 1001 # beaver-tinc-a1-l61.a1.example.com => udp-1003
    set 2 table service-port-forward-target-tmp add tcp,10.20.20.20,1022 1001 # type-unix-a1-l61.a1.example.com => tcp-1022
    set 2 table service-port-forward-target-tmp add tcp,10.20.20.20,2002 1002 # beaver-web-a1-l62.a1.example.com => tcp-2002
    set 2 table service-port-forward-target-tmp add tcp,10.20.20.20,2003 1002 # beaver-tinc-a1-l62.a1.example.com => tcp-2003
    set 2 table service-port-forward-target-tmp add udp,10.20.20.20,2003 1002 # beaver-tinc-a1-l62.a1.example.com => udp-2003
    set 2 table service-port-forward-target-tmp add tcp,10.20.20.20,2022 1002 # type-unix-a1-l62.a1.example.com => tcp-2022
    set 2 table service-port-forward-target-tmp add tcp,10.20.20.20,3002 1002 # beaver-web-a1-l61.a1.example.org => tcp-3002
    set 2 table service-port-forward-target-tmp add tcp,10.20.20.20,3003 1002 # beaver-tinc-a1-l61.a1.example.org => tcp-3003
    set 2 table service-port-forward-target-tmp add udp,10.20.20.20,3003 1002 # beaver-tinc-a1-l61.a1.example.org => udp-3003
    set 2 table service-port-forward-target-tmp add tcp,10.20.20.20,3022 1002 # type-unix-a1-l61.a1.example.org => tcp-3022
    set 2 table service-port-forward-target swap service-port-forward-target-tmp
    set 2 table service-port-forward-target-tmp destroy
    
    add 510 set 2 skipto 511 tag tablearg ip from any to any flow table(service-port-forward-target) in // goto access check rule
    add 510 set 2 skipto 520 ip from any to any in // skip to next stage
    
    add 511 set 2 drop ip from not table(service-port-forward-access-ff5eec00) to any in tagged 1001 // source to target
    add 511 set 2 drop ip from not table(service-port-forward-access-7a40909f) to any in tagged 1002 // source to target
    

    set 2 table service-wan create missing type flow:dst-ip,dst-port
    set 2 table service-wan-tmp create or-flush type flow:dst-ip,dst-port
    set 2 table service-wan-tmp add 10.20.20.20,1002 # beaver-web-a1-l61.a1.example.com 
    set 2 table service-wan-tmp add 10.20.20.20,1003 # beaver-tinc-a1-l61.a1.example.com 
    set 2 table service-wan-tmp add 10.20.20.20,1003 # beaver-tinc-a1-l61.a1.example.com 
    set 2 table service-wan-tmp add 10.20.20.20,1053 # type-unix-a1-l61.a1.example.com 
    set 2 table service-wan-tmp add 10.20.20.20,1053 # type-unix-a1-l61.a1.example.com 
    set 2 table service-wan-tmp add 10.20.20.20,1082 # type-unix-a1-l61.a1.example.com 
    set 2 table service-wan-tmp add 10.20.20.20,1082 # type-unix-a1-l61.a1.example.com 
    set 2 table service-wan-tmp add 10.20.20.20,1022 # type-unix-a1-l61.a1.example.com 
    set 2 table service-wan-tmp add 10.20.20.20,1080 # type-unix-a1-l61.a1.example.com 
    set 2 table service-wan-tmp add 10.20.20.20,1443 # type-unix-a1-l61.a1.example.com 
    set 2 table service-wan-tmp add 10.20.20.20,2002 # beaver-web-a1-l62.a1.example.com 
    set 2 table service-wan-tmp add 10.20.20.20,2003 # beaver-tinc-a1-l62.a1.example.com 
    set 2 table service-wan-tmp add 10.20.20.20,2003 # beaver-tinc-a1-l62.a1.example.com 
    set 2 table service-wan-tmp add 10.20.20.20,2053 # type-unix-a1-l62.a1.example.com 
    set 2 table service-wan-tmp add 10.20.20.20,2053 # type-unix-a1-l62.a1.example.com 
    set 2 table service-wan-tmp add 10.20.20.20,2082 # type-unix-a1-l62.a1.example.com 
    set 2 table service-wan-tmp add 10.20.20.20,2082 # type-unix-a1-l62.a1.example.com 
    set 2 table service-wan-tmp add 10.20.20.20,2022 # type-unix-a1-l62.a1.example.com 
    set 2 table service-wan-tmp add 10.20.20.20,2080 # type-unix-a1-l62.a1.example.com 
    set 2 table service-wan-tmp add 10.20.20.20,2443 # type-unix-a1-l62.a1.example.com 
    set 2 table service-wan-tmp add 10.20.20.20,3002 # beaver-web-a1-l61.a1.example.org 
    set 2 table service-wan-tmp add 10.20.20.20,3003 # beaver-tinc-a1-l61.a1.example.org 
    set 2 table service-wan-tmp add 10.20.20.20,3003 # beaver-tinc-a1-l61.a1.example.org 
    set 2 table service-wan-tmp add 10.20.20.20,3053 # type-unix-a1-l61.a1.example.org 
    set 2 table service-wan-tmp add 10.20.20.20,3053 # type-unix-a1-l61.a1.example.org 
    set 2 table service-wan-tmp add 10.20.20.20,3082 # type-unix-a1-l61.a1.example.org 
    set 2 table service-wan-tmp add 10.20.20.20,3082 # type-unix-a1-l61.a1.example.org 
    set 2 table service-wan-tmp add 10.20.20.20,3022 # type-unix-a1-l61.a1.example.org 
    set 2 table service-wan-tmp add 10.20.20.20,3080 # type-unix-a1-l61.a1.example.org 
    set 2 table service-wan-tmp add 10.20.20.20,3443 # type-unix-a1-l61.a1.example.org 
    set 2 table service-wan-tmp add 10.20.20.20,4002 # beaver-web-a1-l64.a1.example.org 
    set 2 table service-wan-tmp add 10.20.20.20,4003 # beaver-tinc-a1-l64.a1.example.org 
    set 2 table service-wan-tmp add 10.20.20.20,4003 # beaver-tinc-a1-l64.a1.example.org 
    set 2 table service-wan-tmp add 10.20.20.20,4053 # type-unix-a1-l64.a1.example.org 
    set 2 table service-wan-tmp add 10.20.20.20,4053 # type-unix-a1-l64.a1.example.org 
    set 2 table service-wan-tmp add 10.20.20.20,4082 # type-unix-a1-l64.a1.example.org 
    set 2 table service-wan-tmp add 10.20.20.20,4082 # type-unix-a1-l64.a1.example.org 
    set 2 table service-wan-tmp add 10.20.20.20,4022 # type-unix-a1-l64.a1.example.org 
    set 2 table service-wan-tmp add 10.20.20.20,4080 # type-unix-a1-l64.a1.example.org 
    set 2 table service-wan-tmp add 10.20.20.20,4443 # type-unix-a1-l64.a1.example.org
    set 2 table service-wan swap service-wan-tmp
    set 2 table service-wan-tmp destroy

    set 2 table service-lan create missing type flow:src-ip,src-port
    set 2 table service-lan-tmp create or-flush type flow:src-ip,src-port
    set 2 table service-lan-tmp add 127.0.0.1,1001     # beaver-web-a1-l61.a1.example.com 
    set 2 table service-lan-tmp add 127.0.0.1,655      # beaver-tinc-a1-l61.a1.example.com 
    set 2 table service-lan-tmp add 127.0.0.1,655      # beaver-tinc-a1-l61.a1.example.com 
    set 2 table service-lan-tmp add 127.0.0.1,53       # type-unix-a1-l61.a1.example.com 
    set 2 table service-lan-tmp add 127.0.0.1,53       # type-unix-a1-l61.a1.example.com 
    set 2 table service-lan-tmp add 127.0.0.1,82       # type-unix-a1-l61.a1.example.com 
    set 2 table service-lan-tmp add 127.0.0.1,82       # type-unix-a1-l61.a1.example.com 
    set 2 table service-lan-tmp add 127.0.0.1,27       # type-unix-a1-l61.a1.example.com 
    set 2 table service-lan-tmp add 127.0.0.1,80       # type-unix-a1-l61.a1.example.com 
    set 2 table service-lan-tmp add 127.0.0.1,443      # type-unix-a1-l61.a1.example.com 
    set 2 table service-lan-tmp add 192.168.64.27,1001 # beaver-web-a1-l62.a1.example.com 
    set 2 table service-lan-tmp add 192.168.64.27,655  # beaver-tinc-a1-l62.a1.example.com 
    set 2 table service-lan-tmp add 192.168.64.27,655  # beaver-tinc-a1-l62.a1.example.com 
    set 2 table service-lan-tmp add 192.168.64.27,53   # type-unix-a1-l62.a1.example.com 
    set 2 table service-lan-tmp add 192.168.64.27,53   # type-unix-a1-l62.a1.example.com 
    set 2 table service-lan-tmp add 192.168.64.27,82   # type-unix-a1-l62.a1.example.com 
    set 2 table service-lan-tmp add 192.168.64.27,82   # type-unix-a1-l62.a1.example.com 
    set 2 table service-lan-tmp add 192.168.64.27,27   # type-unix-a1-l62.a1.example.com 
    set 2 table service-lan-tmp add 192.168.64.27,80   # type-unix-a1-l62.a1.example.com 
    set 2 table service-lan-tmp add 192.168.64.27,443  # type-unix-a1-l62.a1.example.com 
    set 2 table service-lan-tmp add 192.168.64.26,1001 # beaver-web-a1-l61.a1.example.org 
    set 2 table service-lan-tmp add 192.168.64.26,655  # beaver-tinc-a1-l61.a1.example.org 
    set 2 table service-lan-tmp add 192.168.64.26,655  # beaver-tinc-a1-l61.a1.example.org 
    set 2 table service-lan-tmp add 192.168.64.26,53   # type-unix-a1-l61.a1.example.org 
    set 2 table service-lan-tmp add 192.168.64.26,53   # type-unix-a1-l61.a1.example.org 
    set 2 table service-lan-tmp add 192.168.64.26,82   # type-unix-a1-l61.a1.example.org 
    set 2 table service-lan-tmp add 192.168.64.26,82   # type-unix-a1-l61.a1.example.org 
    set 2 table service-lan-tmp add 192.168.64.26,27   # type-unix-a1-l61.a1.example.org 
    set 2 table service-lan-tmp add 192.168.64.26,80   # type-unix-a1-l61.a1.example.org 
    set 2 table service-lan-tmp add 192.168.64.26,443  # type-unix-a1-l61.a1.example.org 
    set 2 table service-lan-tmp add 192.168.64.27,1001 # beaver-web-a1-l64.a1.example.org 
    set 2 table service-lan-tmp add 192.168.64.27,655  # beaver-tinc-a1-l64.a1.example.org 
    set 2 table service-lan-tmp add 192.168.64.27,655  # beaver-tinc-a1-l64.a1.example.org 
    set 2 table service-lan-tmp add 192.168.64.27,53   # type-unix-a1-l64.a1.example.org 
    set 2 table service-lan-tmp add 192.168.64.27,53   # type-unix-a1-l64.a1.example.org 
    set 2 table service-lan-tmp add 192.168.64.27,82   # type-unix-a1-l64.a1.example.org 
    set 2 table service-lan-tmp add 192.168.64.27,82   # type-unix-a1-l64.a1.example.org 
    set 2 table service-lan-tmp add 192.168.64.27,27   # type-unix-a1-l64.a1.example.org 
    set 2 table service-lan-tmp add 192.168.64.27,80   # type-unix-a1-l64.a1.example.org 
    set 2 table service-lan-tmp add 192.168.64.27,443  # type-unix-a1-l64.a1.example.org
    set 2 table service-lan swap service-lan-tmp
    set 2 table service-lan-tmp destroy


    add 522 set 2 skipto 540 ip from 10.0.0.0/8,172.16.0.0/12,192.168.0.0/16 to not me flow table(service-lan) // svc lan-2-wan
    add 523 set 2 skipto 540 ip from any to 10.20.20.20 flow table(service-wan) // svc any-2-lan

    add 530 set 2 nat 2 tag 7 ip from any to 10.20.20.20 in // incoming nat, dynamic
    add 531 set 2 nat 2 ip from 10.0.0.0/8,172.16.0.0/12,192.168.0.0/16 to any out tagged 7 // hairpin, dynamic
    add 532 set 2 nat 2 ip from 10.0.0.0/8,172.16.0.0/12,192.168.0.0/16 to not 10.0.0.0/8,172.16.0.0/12,192.168.0.0/16 out // outgoing nat, dynamic

    add 535 set 2 skipto 550 ip from any to any

    add 540 set 2 nat 1 tag 7 ip from any to 10.20.20.20 in // incoming nat, service
    add 541 set 2 nat 1 ip from 10.0.0.0/8,172.16.0.0/12,192.168.0.0/16 to any out tagged 7 // hairpin, service
    add 542 set 2 nat 1 ip from 10.0.0.0/8,172.16.0.0/12,192.168.0.0/16 to not 10.0.0.0/8,172.16.0.0/12,192.168.0.0/16 out // outgoing nat, service


    add 800 set 2 deny icmp from me to table(tinc-tap-l6-hosts-local) icmptype 5 in // block redirects for tincd
    


    add 900 set 2 count ip6 from any to any // ipv6 of all
    add 900 set 2 count ip from not me to me in // incoming of all
    add 900 set 2 allow ip from any to any // all traffic blindly allowed

    set swap 2 1
    set enable 1
    delete set 2
    set 2 table all destroy
EOF
