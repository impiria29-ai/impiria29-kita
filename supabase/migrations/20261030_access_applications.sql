-- Permohonan penduduk: senarai pending dan kelulusan melalui frontend AJK/admin.
c
r
e
a
t
e
 
o
r
 
r
e
p
l
a
c
e
 
f
u
n
c
t
i
o
n
 
p
u
b
l
i
c
.
l
i
s
t
_
a
c
c
e
s
s
_
a
p
p
l
i
c
a
t
i
o
n
s
(
)


r
e
t
u
r
n
s
 
t
a
b
l
e
(
u
s
e
r
_
i
d
 
u
u
i
d
,
f
u
l
l
_
n
a
m
e
 
t
e
x
t
,
p
h
o
n
e
 
t
e
x
t
,
r
e
q
u
e
s
t
e
d
_
h
o
u
s
e
_
n
u
m
b
e
r
 
s
m
a
l
l
i
n
t
,
c
r
e
a
t
e
d
_
a
t
 
t
i
m
e
s
t
a
m
p
t
z
)


l
a
n
g
u
a
g
e
 
s
q
l
 
s
t
a
b
l
e
 
s
e
c
u
r
i
t
y
 
d
e
f
i
n
e
r
 
s
e
t
 
s
e
a
r
c
h
_
p
a
t
h
 
=
 
p
u
b
l
i
c
,
 
a
u
t
h


a
s
 
$
$


 
 
s
e
l
e
c
t
 
p
.
u
s
e
r
_
i
d
,
p
.
f
u
l
l
_
n
a
m
e
,
p
.
p
h
o
n
e
,
c
o
a
l
e
s
c
e
(
p
.
r
e
q
u
e
s
t
e
d
_
h
o
u
s
e
_
n
u
m
b
e
r
,
p
.
h
o
u
s
e
_
n
u
m
b
e
r
)
,
p
.
c
r
e
a
t
e
d
_
a
t


 
 
f
r
o
m
 
p
u
b
l
i
c
.
p
r
o
f
i
l
e
s
 
p


 
 
w
h
e
r
e
 
p
u
b
l
i
c
.
i
s
_
a
j
k
(
)
 
a
n
d
 
p
.
r
o
l
e
=
'
r
e
s
i
d
e
n
t
'
 
a
n
d
 
p
.
a
p
p
r
o
v
a
l
_
s
t
a
t
u
s
=
'
p
e
n
d
i
n
g
'


 
 
o
r
d
e
r
 
b
y
 
p
.
c
r
e
a
t
e
d
_
a
t
 
a
s
c
;


$
$
;




c
r
e
a
t
e
 
o
r
 
r
e
p
l
a
c
e
 
f
u
n
c
t
i
o
n
 
p
u
b
l
i
c
.
r
e
v
i
e
w
_
a
c
c
e
s
s
_
a
p
p
l
i
c
a
t
i
o
n
(
p
_
u
s
e
r
_
i
d
 
u
u
i
d
,
p
_
h
o
u
s
e
_
n
u
m
b
e
r
 
s
m
a
l
l
i
n
t
)


r
e
t
u
r
n
s
 
v
o
i
d
 
l
a
n
g
u
a
g
e
 
p
l
p
g
s
q
l
 
s
e
c
u
r
i
t
y
 
d
e
f
i
n
e
r
 
s
e
t
 
s
e
a
r
c
h
_
p
a
t
h
 
=
 
p
u
b
l
i
c
,
 
a
u
t
h


a
s
 
$
$


d
e
c
l
a
r
e
 
v
_
u
p
d
a
t
e
d
 
i
n
t
e
g
e
r
;


b
e
g
i
n


 
 
i
f
 
n
o
t
 
p
u
b
l
i
c
.
i
s
_
a
j
k
(
)
 
t
h
e
n
 
r
a
i
s
e
 
e
x
c
e
p
t
i
o
n
 
'
H
a
n
y
a
 
A
J
K
 
a
t
a
u
 
a
d
m
i
n
 
b
o
l
e
h
 
m
e
l
u
l
u
s
k
a
n
 
p
e
r
m
o
h
o
n
a
n
.
'
;
 
e
n
d
 
i
f
;


 
 
i
f
 
p
_
h
o
u
s
e
_
n
u
m
b
e
r
 
i
s
 
n
u
l
l
 
o
r
 
p
_
h
o
u
s
e
_
n
u
m
b
e
r
 
n
o
t
 
b
e
t
w
e
e
n
 
1
 
a
n
d
 
4
3
 
t
h
e
n
 
r
a
i
s
e
 
e
x
c
e
p
t
i
o
n
 
'
N
o
m
b
o
r
 
r
u
m
a
h
 
t
i
d
a
k
 
s
a
h
.
'
;
 
e
n
d
 
i
f
;


 
 
u
p
d
a
t
e
 
p
u
b
l
i
c
.
p
r
o
f
i
l
e
s
 
s
e
t
 
a
p
p
r
o
v
a
l
_
s
t
a
t
u
s
=
'
a
p
p
r
o
v
e
d
'
,
h
o
u
s
e
_
n
u
m
b
e
r
=
p
_
h
o
u
s
e
_
n
u
m
b
e
r


 
 
 
 
w
h
e
r
e
 
u
s
e
r
_
i
d
=
p
_
u
s
e
r
_
i
d
 
a
n
d
 
r
o
l
e
=
'
r
e
s
i
d
e
n
t
'
 
a
n
d
 
a
p
p
r
o
v
a
l
_
s
t
a
t
u
s
=
'
p
e
n
d
i
n
g
'
;


 
 
g
e
t
 
d
i
a
g
n
o
s
t
i
c
s
 
v
_
u
p
d
a
t
e
d
 
=
 
r
o
w
_
c
o
u
n
t
;


 
 
i
f
 
v
_
u
p
d
a
t
e
d
=
0
 
t
h
e
n
 
r
a
i
s
e
 
e
x
c
e
p
t
i
o
n
 
'
P
e
r
m
o
h
o
n
a
n
 
t
i
d
a
k
 
d
i
t
e
m
u
i
 
a
t
a
u
 
s
u
d
a
h
 
d
i
p
r
o
s
e
s
.
'
;
 
e
n
d
 
i
f
;


e
n
d
;


$
$
;


revoke all on function public.list_access_applications(),public.review_access_application(uuid,smallint) from public,anon;
grant execute on function public.list_access_applications(),public.review_access_application(uuid,smallint) to authenticated;
