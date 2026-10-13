"use client";
import {useForm} from 'react-hook-form';
import {zodResolver} from '@hookform/resolvers/zod';
import {z} from 'zod';
import {profileSchema} from '@devtrust/contracts';
import type {PublicUser} from '@devtrust/contracts';
import {Card,PageHeader,FormField,Input,Button,Badge} from '@devtrust/ui';
import {toast} from 'sonner';
import {useAccount} from '@/hooks/account-context';
import {mutate} from '@/lib/api';
export function Profile(){const {user,setUser}=useAccount();const {register,handleSubmit,formState:{errors,isSubmitting}}=useForm<z.infer<typeof profileSchema>>({resolver:zodResolver(profileSchema),defaultValues:{firstName:user.firstName,lastName:user.lastName,phone:user.phone}});return <><PageHeader title="O meu perfil" description="Mantenha as informações da sua conta atualizadas."/><div className="grid-2"><Card><form className="form-stack" onSubmit={handleSubmit(async data=>{try{setUser(await mutate<PublicUser>('/users/me',data,'PATCH'));toast.success('Perfil atualizado');}catch(e){toast.error((e as Error).message);}})}>{(['firstName','lastName','phone'] as const).map((field,i)=><FormField key={field} id={field} label={['Nome','Apelido','Telefone'][i]} error={errors[field]?.message}><Input id={field} {...register(field)}/></FormField>)}<Button disabled={isSubmitting}>Guardar alterações</Button></form></Card><Card><h3>Identidade da conta</h3><p>{user.email}</p><Badge variant={user.emailVerifiedAt?'success':'warning'}>{user.emailVerifiedAt?'Email confirmado':'Email por confirmar'}</Badge>{!user.emailVerifiedAt&&<div className="section-gap"><Button variant="secondary" onClick={async()=>{try{await mutate('/auth/resend-verification');toast.success('Pedido de confirmação recebido');}catch(e){toast.error((e as Error).message);}}}>Reenviar confirmação</Button></div>}</Card></div></>;}
